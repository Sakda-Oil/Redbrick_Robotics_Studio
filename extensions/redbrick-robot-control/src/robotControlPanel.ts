/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Buffer } from 'buffer';
import * as vscode from 'vscode';
import { RosbridgeClient } from './rosbridgeClient';
import { robotControlHtml } from './robotControlWebview';
import { robotProfiles } from './robotProfiles';
import { IRobotProfile, RobotConnectionState } from './robotTypes';
import { configuredProfile, IRobotCustomization, ISavedRobotSettings, robotUrl, validateRobotSettings } from './robotConfiguration';

interface IWebviewMessage {
	readonly type: 'ready' | 'connect' | 'disconnect' | 'motion' | 'emergencyStop' | 'releaseEmergencyStop' | 'slam' | 'saveMap' | 'navigate' | 'cancelNavigation' | 'refreshGraph' | 'exportLog' | 'saveSnapshot' | 'saveSettings' | 'testConnection' | 'exportSetup';
	readonly secure?: boolean;
	readonly customization?: IRobotCustomization;
	readonly format?: string;
	readonly host?: string;
	readonly port?: number;
	readonly profileId?: string;
	readonly linear?: number;
	readonly angular?: number;
	readonly start?: boolean;
	readonly name?: string;
	readonly x?: number;
	readonly y?: number;
	readonly yaw?: number;
	readonly text?: string;
	readonly data?: string;
}

type UnknownRecord = Record<string, unknown>;

export class RobotControlPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly output = vscode.window.createOutputChannel(vscode.l10n.t('Redbrick Robot Control'));
	private readonly client = new RosbridgeClient((state, detail) => this.onConnectionState(state, detail), envelope => {
		if (envelope.op === 'status' || envelope.op.includes('action')) { this.output.appendLine(JSON.stringify(envelope)); }
	});
	private profile: IRobotProfile;
	private subscriptionDisposers: Array<() => void> = [];
	private connectionState: RobotConnectionState = 'disconnected';
	private lastMotionAt = 0;
	private motionActive = false;
	private emergencyStopped = false;
	private readonly deadmanTimer: NodeJS.Timeout;
	private opening: Promise<void> | undefined;
	private pendingPage: string | undefined;
	private testing = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.profile = configuredProfile(this.settings());
		this.deadmanTimer = setInterval(() => {
			const timeout = vscode.workspace.getConfiguration('redbrickRobotControl').get<number>('deadmanTimeout', 400);
			if (this.motionActive && Date.now() - this.lastMotionAt > timeout) { this.publishStop('Dead-man timeout'); }
		}, 100);
	}

	async show(settingsPage = false): Promise<void> {
		if (settingsPage) { this.pendingPage = 'settings'; }
		if (this.opening) { await this.opening; return; }
		if (this.panel) { this.panel.reveal(); await this.postInitial(); return; }
		const panel = vscode.window.createWebviewPanel('redbrickRobotControl.panel', vscode.l10n.t('Redbrick Robot Control'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] });
		this.panel = panel;
		panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'robot-control.svg');
		let ready: () => void = () => { };
		const loaded = new Promise<void>(resolve => { ready = resolve; });
		const messages = panel.webview.onDidReceiveMessage(message => {
			if (message?.type === 'ready') { ready(); }
			void this.handle(message as IWebviewMessage).catch(error => this.reportError(error));
		});
		const viewState = panel.onDidChangeViewState(event => { if (!event.webviewPanel.active) { this.publishStop('Control window inactive'); } });
		const closed = panel.onDidDispose(() => {
			this.disconnect();
			this.panel = undefined;
			messages.dispose(); viewState.dispose(); closed.dispose(); ready();
		});
		panel.webview.html = robotControlHtml(panel.webview, this.context.extensionUri);
		this.opening = (async () => {
			let timer: NodeJS.Timeout | undefined;
			await Promise.race([loaded, new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); })]);
			clearTimeout(timer);
			if (this.panel !== panel) { return; }
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			if (!(activeTab?.input instanceof vscode.TabInputWebview) || !activeTab.input.viewType.endsWith('redbrickRobotControl.panel')) {
				throw new Error(vscode.l10n.t('Robot Control could not be detached because another editor became active. Use Move Editor into New Window from its tab menu.'));
			}
			await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
		})().catch(error => this.reportError(error)).finally(() => { this.opening = undefined; });
		await this.opening;
	}

	async connectFromCommand(): Promise<void> {
		await this.show();
		const settings = this.settings();
		if (settings.host) { await this.connect(settings); }
		else { await this.post({ type: 'notice', message: vscode.l10n.t('Enter the robot IP address, then click Connect.'), error: true }); }
	}

	disconnect(): void {
		this.publishStop('Disconnect');
		this.clearSubscriptions();
		this.client.disconnect();
	}

	async exportRobotSetup(): Promise<void> {
		const selection = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: vscode.l10n.t('Export Robot Setup Here')
		});
		if (!selection?.length) { return; }
		const target = vscode.Uri.joinPath(selection[0], 'redbrick-robot-control-setup');
		await vscode.workspace.fs.createDirectory(target);
		for (const file of ['setup_robot_control.sh', 'redbrick_system_monitor.py', 'redbrick_navigation_gateway.py']) {
			const source = vscode.Uri.joinPath(this.context.extensionUri, 'robot-setup', file);
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(target, file), await vscode.workspace.fs.readFile(source));
		}
		void vscode.window.showInformationMessage(vscode.l10n.t('Robot setup package exported to {0}.', target.fsPath));
	}

	emergencyStop(): void {
		this.emergencyStopped = true;
		void this.post({ type: 'safety', emergencyStopped: true });
		if (!this.client.isConnected) { return; }
		this.client.publish(this.profile.topics.navigationCancel, 'std_msgs/msg/Empty', {});
		this.publishStop('Emergency stop');
		for (let index = 0; index < 3; index++) {
			this.client.publish(this.profile.topics.emergencyStop, 'std_msgs/msg/Bool', { data: true });
		}
		void this.post({ type: 'notice', message: vscode.l10n.t('Emergency stop activated.'), error: true });
	}

	dispose(): void {
		clearInterval(this.deadmanTimer);
		this.disconnect();
		this.panel?.dispose();
		this.output.dispose();
	}

	private async handle(message: IWebviewMessage): Promise<void> {
		switch (message.type) {
			case 'ready': await this.postInitial(); break;
			case 'saveSettings': await this.saveSettings(this.validateSettings(message)); break;
			case 'testConnection': await this.testConnection(message); break;
			case 'exportSetup': await this.exportRobotSetup(); break;
			case 'connect': await this.connect(this.validateSettings(message)); break;
			case 'disconnect': this.disconnect(); break;
			case 'motion': this.publishMotion(Number(message.linear) || 0, Number(message.angular) || 0); break;
			case 'emergencyStop': this.emergencyStop(); break;
			case 'releaseEmergencyStop': this.releaseEmergencyStop(); break;
			case 'slam': await this.changeSlam(Boolean(message.start)); break;
			case 'saveMap': await this.saveMap(message.name || 'redbrick_map'); break;
			case 'navigate': this.navigate(Number(message.x), Number(message.y), Number(message.yaw) || 0); break;
			case 'cancelNavigation': this.cancelNavigation(); break;
			case 'refreshGraph': await this.refreshGraph(); break;
			case 'exportLog': await this.exportText(message.text || ''); break;
			case 'saveSnapshot': await this.saveSnapshot(message.data || '', message.format); break;
		}
	}

	private async connect(settings: ISavedRobotSettings): Promise<void> {
		if (this.connectionState === 'connecting') { return; }
		if (this.client.isConnected) { this.disconnect(); }
		settings = validateRobotSettings(settings);
		this.profile = configuredProfile(settings);
		const url = robotUrl(settings);
		this.output.appendLine(`Connecting to ${url} with profile ${this.profile.id}`);
		await this.client.connect(url);
		if (this.emergencyStopped) { this.emergencyStop(); }
		this.setupSubscriptions();
		await this.postInitial();
		await this.refreshGraph();
	}

	private setupSubscriptions(): void {
		this.clearSubscriptions();
		const topics = this.profile.topics;
		this.subscriptionDisposers.push(
			this.client.subscribe(topics.navigationStatus, 'std_msgs/msg/String', message => void this.post({ type: 'navigation', status: string(record(message).data) })),
			this.client.subscribe(topics.battery, 'sensor_msgs/msg/BatteryState', message => {
				const data = record(message);
				void this.post({ type: 'battery', percentage: number(data.percentage), voltage: number(data.voltage) });
			}, 500),
			this.client.subscribe(topics.systemStatus, 'std_msgs/msg/String', message => {
				try { void this.post({ type: 'system', ...JSON.parse(string(record(message).data)) as UnknownRecord }); }
				catch { this.output.appendLine('Invalid /redbrick/system_status message.'); }
			}, 500),
			this.client.subscribe(topics.camera, 'sensor_msgs/msg/CompressedImage', message => {
				const data = record(message);
				const format = string(data.format).toLowerCase().includes('png') ? 'image/png' : 'image/jpeg';
				void this.post({ type: 'camera', format, data: string(data.data) });
			}, 100),
			this.client.subscribe(topics.scan, 'sensor_msgs/msg/LaserScan', message => void this.post({ type: 'scan', data: message }), 100),
			this.client.subscribe(topics.map, 'nav_msgs/msg/OccupancyGrid', message => void this.post({ type: 'map', data: message }), 500),
			this.client.subscribe(topics.odom, 'nav_msgs/msg/Odometry', message => this.onOdometry(message), 100),
			this.client.subscribe(topics.diagnostics, 'diagnostic_msgs/msg/DiagnosticArray', message => this.onDiagnostics(message), 500),
			this.client.subscribe(topics.logs, 'rcl_interfaces/msg/Log', message => this.onLog(message), 50)
		);
	}

	private publishMotion(linear: number, angular: number): void {
		if (!Number.isFinite(linear) || !Number.isFinite(angular)) { throw new Error(vscode.l10n.t('Motion values must be finite numbers.')); }
		if (!this.client.isConnected) { throw new Error(vscode.l10n.t('Connect to the robot before sending motion commands.')); }
		if (this.emergencyStopped && (linear !== 0 || angular !== 0)) { return; }
		const limitedLinear = clamp(linear, -this.profile.limits.linear, this.profile.limits.linear);
		const limitedAngular = clamp(angular, -this.profile.limits.angular, this.profile.limits.angular);
		this.client.publish(this.profile.topics.cmdVel, 'geometry_msgs/msg/Twist', twist(limitedLinear, limitedAngular));
		this.lastMotionAt = Date.now();
		this.motionActive = limitedLinear !== 0 || limitedAngular !== 0;
	}

	private publishStop(reason: string): void {
		if (this.client.isConnected) {
			for (let index = 0; index < 3; index++) { this.client.publish(this.profile.topics.cmdVel, 'geometry_msgs/msg/Twist', twist(0, 0)); }
			this.output.appendLine(`Motion stopped: ${reason}`);
		}
		this.motionActive = false;
	}

	private releaseEmergencyStop(): void {
		if (!this.client.isConnected) { throw new Error(vscode.l10n.t('Robot is not connected.')); }
		this.publishStop('Emergency stop reset');
		this.client.publish(this.profile.topics.emergencyStop, 'std_msgs/msg/Bool', { data: false });
		this.emergencyStopped = false;
		void this.post({ type: 'safety', emergencyStopped: false });
	}

	private async changeSlam(start: boolean): Promise<void> {
		this.requireConnection();
		const transition = start ? { id: 3, label: 'activate' } : { id: 4, label: 'deactivate' };
		const result = record(await this.client.callService(this.profile.services.slamLifecycle, 'lifecycle_msgs/srv/ChangeState', { transition }));
		if (result.success !== true) { throw new Error(vscode.l10n.t('SLAM rejected the transition. Check that the lifecycle node is configured.')); }
		await this.post({ type: 'notice', message: start ? vscode.l10n.t('SLAM mapping started.') : vscode.l10n.t('SLAM mapping stopped.') });
	}

	private async saveMap(name: string): Promise<void> {
		this.requireConnection();
		const safeName = name.replace(/[^A-Za-z0-9_.-]/g, '_');
		const result = record(await this.client.callService(this.profile.services.saveMap, 'nav2_msgs/srv/SaveMap', { map_topic: this.profile.topics.map, map_url: safeName, image_format: 'pgm', map_mode: 'trinary', free_thresh: 0.25, occupied_thresh: 0.65 }, 30000));
		if (result.result !== true) { throw new Error(vscode.l10n.t('Map saver could not save the map. Check its map subscription and output directory.')); }
		await this.post({ type: 'notice', message: vscode.l10n.t('Map saved as {0} on the robot.', safeName) });
	}

	private navigate(x: number, y: number, yaw: number): void {
		this.requireConnection();
		if (this.emergencyStopped) { throw new Error(vscode.l10n.t('Reset Emergency Stop before sending navigation goals.')); }
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(yaw)) { throw new Error(vscode.l10n.t('Select a valid point on the map.')); }
		const now = Date.now();
		const pose = {
			header: { frame_id: this.profile.frames.map, stamp: { sec: Math.floor(now / 1000), nanosec: (now % 1000) * 1000000 } },
			pose: { position: { x, y, z: 0 }, orientation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) } }
		};
		this.client.publish(this.profile.topics.navigationGoal, 'geometry_msgs/msg/PoseStamped', pose);
		void this.post({ type: 'navigation', status: vscode.l10n.t('Navigation goal sent to {0}, {1}.', x.toFixed(2), y.toFixed(2)) });
	}

	private cancelNavigation(): void {
		this.requireConnection();
		this.client.publish(this.profile.topics.navigationCancel, 'std_msgs/msg/Empty', {});
		this.publishStop('Navigation cancelled');
		void this.post({ type: 'navigation', status: vscode.l10n.t('Navigation cancellation requested.') });
	}

	private async refreshGraph(): Promise<void> {
		if (!this.client.isConnected) { return; }
		try {
			const [topicResponse, nodeResponse] = await Promise.all([
				this.client.callService('/rosapi/topics', 'rosapi/srv/Topics', {}),
				this.client.callService('/rosapi/nodes', 'rosapi/srv/Nodes', {})
			]);
			const topicData = record(topicResponse);
			const names = array(topicData.topics).map(string);
			const types = array(topicData.types).map(string);
			const topics = names.map((name, index) => ({ name, type: types[index] || '' }));
			const nodes = array(record(nodeResponse).nodes).map(value => ({ name: string(value), type: 'ROS 2 Node' }));
			await this.post({ type: 'graph', topics, nodes });
		} catch (error) {
			this.output.appendLine(`ROS graph refresh failed: ${message(error)}`);
			await this.post({ type: 'notice', message: vscode.l10n.t('ROS graph unavailable. Ensure rosapi is running.'), error: true });
		}
	}

	private onOdometry(messageValue: unknown): void {
		const data = record(messageValue);
		const pose = record(record(record(data.pose).pose).position);
		const twistValue = record(record(record(data.twist).twist));
		void this.post({ type: 'odom', x: number(pose.x), y: number(pose.y), linear: number(record(twistValue.linear).x), angular: number(record(twistValue.angular).z) });
	}

	private onDiagnostics(messageValue: unknown): void {
		const items = array(record(messageValue).status).map(value => {
			const status = record(value);
			return { name: string(status.name), type: ['OK', 'WARN', 'ERROR', 'STALE'][number(status.level)] || 'UNKNOWN' };
		});
		void this.post({ type: 'sensors', items });
	}

	private onLog(messageValue: unknown): void {
		const data = record(messageValue);
		const levelNumber = number(data.level);
		const level = levelNumber >= 40 ? 'error' : levelNumber >= 30 ? 'warn' : 'info';
		const entry = { level, text: `[${new Date().toISOString()}] [${string(data.name) || 'ros2'}] ${string(data.msg)}` };
		this.output.appendLine(entry.text);
		void this.post({ type: 'log', entry });
	}

	private clearSubscriptions(): void {
		for (const dispose of this.subscriptionDisposers.splice(0)) { dispose(); }
	}

	private onConnectionState(state: RobotConnectionState, detail?: string): void {
		this.connectionState = state;
		if (state !== 'connected') { this.motionActive = false; }
		void this.post({ type: 'connection', state, detail });
	}

	private settings(): ISavedRobotSettings {
		const configuration = vscode.workspace.getConfiguration('redbrickRobotControl');
		const saved = configuration.get<ISavedRobotSettings>('robotSettings');
		if (saved?.profileId) { return saved; }
		return {
			host: configuration.get<string>('defaultHost', '').trim(),
			port: configuration.get<number>('rosbridgePort', 9090),
			secure: configuration.get<boolean>('secureWebSocket', false),
			profileId: configuration.get<string>('profile', 'redbrick-diff-drive-v1')
		};
	}

	private validateSettings(messageValue: IWebviewMessage): ISavedRobotSettings {
		return validateRobotSettings({ host: messageValue.host || '', port: Number(messageValue.port), secure: Boolean(messageValue.secure), profileId: messageValue.profileId || 'redbrick-diff-drive-v1', customization: messageValue.customization });
	}

	private async saveSettings(settings: ISavedRobotSettings): Promise<void> {
		if (this.connectionState === 'connected' || this.connectionState === 'connecting') { throw new Error(vscode.l10n.t('Disconnect before changing robot settings.')); }
		await vscode.workspace.getConfiguration('redbrickRobotControl').update('robotSettings', settings, vscode.ConfigurationTarget.Global);
		await this.postInitial();
		await this.post({ type: 'notice', message: vscode.l10n.t('Robot settings saved. Click Connect when ready.') });
	}

	private async testConnection(input: IWebviewMessage): Promise<void> {
		if (this.testing) { return; }
		this.testing = true;
		const probe = new RosbridgeClient(() => { });
		try {
			const settings = this.validateSettings(input);
			const profile = configuredProfile(settings);
			await probe.connect(robotUrl(settings));
			const [topics, services] = await Promise.all([
				probe.callService('/rosapi/topics', 'rosapi/srv/Topics', {}),
				probe.callService('/rosapi/services', 'rosapi/srv/Services', {})
			]);
			const names = array(record(topics).topics).map(string);
			const serviceNames = array(record(services).services).map(string);
			const missing = [profile.topics.camera, profile.topics.scan, profile.topics.map].filter(name => !names.includes(name));
			const missingServices = Object.values(profile.services).filter(name => !serviceNames.includes(name));
			await this.post({ type: 'testResult', message: vscode.l10n.t('Rosbridge connected. {0} topics, {1} services. Missing sensor/map topics: {2}. Missing mapping services: {3}.', names.length, serviceNames.length, missing.join(', ') || 'none', missingServices.join(', ') || 'none') });
		} catch (error) {
			await this.post({ type: 'testResult', message: vscode.l10n.t('Connection test failed: {0}', message(error)) });
		} finally { probe.disconnect(); this.testing = false; }
	}

	private async postInitial(): Promise<void> {
		if (!this.panel) { return; }
		const settings = this.settings();
		if (!this.client.isConnected) { this.profile = configuredProfile(settings); }
		await this.post({ type: 'initial', settings, profile: this.profile, profiles: robotProfiles, connectionState: this.connectionState, emergencyStopped: this.emergencyStopped, page: this.pendingPage });
		this.pendingPage = undefined;
	}

	private post(messageValue: unknown): Thenable<boolean> {
		return this.panel?.webview.postMessage(messageValue) ?? Promise.resolve(false);
	}

	private requireConnection(): void {
		if (!this.client.isConnected) { throw new Error(vscode.l10n.t('Connect to the robot first.')); }
	}

	private async exportText(text: string): Promise<void> {
		const uri = await vscode.window.showSaveDialog({ filters: { 'Log files': ['log', 'txt'] }, defaultUri: vscode.Uri.file(`redbrick-ros-${Date.now()}.log`) });
		if (uri) { await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text)); }
	}

	private async saveSnapshot(data: string, format?: string): Promise<void> {
		if (!data) { throw new Error(vscode.l10n.t('No camera frame is available.')); }
		const extension = format === 'image/png' ? 'png' : 'jpg';
		const uri = await vscode.window.showSaveDialog({ filters: { 'Camera Image': [extension] }, defaultUri: vscode.Uri.file(`redbrick-camera-${Date.now()}.${extension}`) });
		if (uri) { await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'base64')); }
	}

	private reportError(error: unknown): void {
		const detail = message(error);
		this.output.appendLine(detail);
		this.output.show(true);
		void this.post({ type: 'notice', message: detail, error: true });
	}
}

function record(value: unknown): UnknownRecord { return value && typeof value === 'object' ? value as UnknownRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string { return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : Number.NaN; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function twist(linear: number, angular: number): unknown { return { linear: { x: linear, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angular } }; }
