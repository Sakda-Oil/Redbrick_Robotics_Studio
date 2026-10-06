/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { IRosbridgeEnvelope, RobotConnectionState } from './robotTypes';

interface IWebSocketMessageEvent { readonly data: unknown }
interface IWebSocketCloseEvent { readonly code: number; readonly reason: string }
interface IWebSocketLike {
	readonly readyState: number;
	onopen: (() => void) | null;
	onmessage: ((event: IWebSocketMessageEvent) => void) | null;
	onerror: (() => void) | null;
	onclose: ((event: IWebSocketCloseEvent) => void) | null;
	send(data: string): void;
	close(code?: number, reason?: string): void;
}
type WebSocketConstructor = new (url: string) => IWebSocketLike;
type TopicHandler = (message: unknown) => void;
type StateHandler = (state: RobotConnectionState, detail?: string) => void;

export class RosbridgeClient {
	private socket: IWebSocketLike | undefined;
	private state: RobotConnectionState = 'disconnected';
	private readonly topics = new Map<string, Set<TopicHandler>>();
	private readonly pendingServices = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
	private readonly advertisedTopics = new Set<string>();
	private abortConnect: (() => void) | undefined;

	constructor(private readonly onState: StateHandler, private readonly onProtocolMessage?: (message: IRosbridgeEnvelope) => void) { }

	get connectionState(): RobotConnectionState { return this.state; }
	get isConnected(): boolean { return this.state === 'connected' && this.socket?.readyState === 1; }

	connect(url: string, timeoutMs = 8000): Promise<void> {
		this.disconnect(false);
		this.setState('connecting', url);
		const Constructor = (globalThis as unknown as { WebSocket?: WebSocketConstructor }).WebSocket;
		if (!Constructor) {
			this.setState('error', 'This Redbrick runtime does not provide WebSocket support.');
			return Promise.reject(new Error('WebSocket is not available in this Redbrick runtime.'));
		}
		return new Promise<void>((resolve, reject) => {
			const socket = new Constructor(url);
			this.socket = socket;
			let settled = false;
			const timer = setTimeout(() => {
				if (settled) { return; }
				settled = true;
				this.abortConnect = undefined;
				socket.close(4000, 'Connection timeout');
				this.setState('error', 'Connection timed out.');
				reject(new Error(`Timed out connecting to ${url}.`));
			}, timeoutMs);
			this.abortConnect = () => {
				clearTimeout(timer);
				if (!settled) { settled = true; reject(new Error('Connection cancelled.')); }
			};
			socket.onopen = () => {
				if (settled || this.socket !== socket) { return; }
				settled = true;
				this.abortConnect = undefined;
				clearTimeout(timer);
				this.setState('connected', url);
				resolve();
			};
			socket.onmessage = event => { if (this.socket === socket) { this.handle(event.data); } };
			socket.onerror = () => {
				if (this.socket !== socket) { return; }
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					reject(new Error(`Unable to connect to ${url}. Verify rosbridge_server and the network.`));
				}
				this.setState('error', 'WebSocket connection error.');
			};
			socket.onclose = event => {
				clearTimeout(timer);
				if (!settled) { settled = true; reject(new Error(`Connection closed before opening (${event.code}).`)); }
				if (this.socket !== socket) { return; }
				this.abortConnect = undefined;
				this.socket = undefined;
				this.rejectPending(`Connection closed (${event.code}${event.reason ? `: ${event.reason}` : ''}).`);
				if (this.state !== 'disconnected') { this.setState('disconnected', event.reason || 'Connection closed.'); }
			};
		});
	}

	disconnect(notify = true): void {
		this.abortConnect?.();
		this.abortConnect = undefined;
		const socket = this.socket;
		this.socket = undefined;
		this.topics.clear();
		this.advertisedTopics.clear();
		this.rejectPending('Robot disconnected.');
		if (socket && socket.readyState < 2) { socket.close(1000, 'Redbrick disconnect'); }
		if (notify) { this.setState('disconnected'); }
	}

	subscribe(topic: string, type: string, handler: TopicHandler, throttleRate = 0): () => void {
		let handlers = this.topics.get(topic);
		if (!handlers) {
			handlers = new Set();
			this.topics.set(topic, handlers);
			this.send({ op: 'subscribe', id: `sub:${topic}`, topic, type, throttle_rate: throttleRate, queue_length: 1 });
		}
		handlers.add(handler);
		return () => {
			handlers?.delete(handler);
			if (!handlers?.size) {
				this.topics.delete(topic);
				if (this.isConnected) { this.send({ op: 'unsubscribe', id: `sub:${topic}`, topic }); }
			}
		};
	}

	publish(topic: string, type: string, message: unknown): void {
		if (!this.advertisedTopics.has(topic)) {
			this.send({ op: 'advertise', id: `pub:${topic}`, topic, type, queue_size: 1, latch: false });
			this.advertisedTopics.add(topic);
		}
		this.send({ op: 'publish', topic, msg: message });
	}

	callService(service: string, type: string, args: unknown, timeoutMs = 10000): Promise<unknown> {
		const id = `service:${randomUUID()}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingServices.delete(id);
				reject(new Error(`ROS service ${service} timed out.`));
			}, timeoutMs);
			this.pendingServices.set(id, { resolve, reject, timer });
			try { this.send({ op: 'call_service', id, service, type, args }); }
			catch (error) {
				clearTimeout(timer);
				this.pendingServices.delete(id);
				reject(error);
			}
		});
	}

	sendActionGoal(action: string, actionType: string, args: unknown): string {
		const id = `goal:${randomUUID()}`;
		this.send({ op: 'send_action_goal', id, action, action_type: actionType, args, feedback: true });
		return id;
	}

	cancelActionGoal(action: string, goalId?: string): void {
		this.send({ op: 'cancel_action_goal', id: goalId ?? `cancel:${randomUUID()}`, action });
	}

	private send(envelope: IRosbridgeEnvelope): void {
		if (!this.socket || !this.isConnected) { throw new Error('Robot is not connected.'); }
		this.socket.send(JSON.stringify(envelope));
	}

	private handle(data: unknown): void {
		try {
			const text = typeof data === 'string' ? data : String(data);
			const envelope = JSON.parse(text) as IRosbridgeEnvelope;
			this.onProtocolMessage?.(envelope);
			if (envelope.op === 'publish' && envelope.topic) {
				for (const handler of this.topics.get(envelope.topic) ?? []) { handler(envelope.msg); }
			} else if (envelope.op === 'service_response' && envelope.id) {
				const pending = this.pendingServices.get(envelope.id);
				if (pending) {
					clearTimeout(pending.timer);
					this.pendingServices.delete(envelope.id);
					if (envelope.result === false) { pending.reject(new Error(`ROS service ${envelope.service ?? ''} returned failure.`)); }
					else { pending.resolve(envelope.values); }
				}
			}
		} catch (error) {
			this.onProtocolMessage?.({ op: 'redbrick_error', msg: error instanceof Error ? error.message : String(error) });
		}
	}

	private rejectPending(message: string): void {
		for (const pending of this.pendingServices.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error(message));
		}
		this.pendingServices.clear();
	}

	private setState(state: RobotConnectionState, detail?: string): void {
		this.state = state;
		this.onState(state, detail);
	}
}
