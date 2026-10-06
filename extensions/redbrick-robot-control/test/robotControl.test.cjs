/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Redbrick Robotics Co., Ltd. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict');
const test = require('node:test');

class MockWebSocket {
	static instances = [];
	readyState = 0;
	sent = [];
	onopen = null;
	onmessage = null;
	onerror = null;
	onclose = null;

	constructor(url) {
		this.url = url;
		MockWebSocket.instances.push(this);
		queueMicrotask(() => {
			this.readyState = 1;
			this.onopen?.();
		});
	}

	send(data) { this.sent.push(JSON.parse(data)); }
	close(code = 1000, reason = '') {
		this.readyState = 3;
		this.onclose?.({ code, reason });
	}
	receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

globalThis.WebSocket = MockWebSocket;

const { RosbridgeClient } = require('../out/rosbridgeClient.js');
const { robotProfile, robotProfiles } = require('../out/robotProfiles.js');

test('robot profiles include ROS 2 motion, telemetry, mapping, and navigation endpoints', () => {
	assert.equal(robotProfiles.length, 2);
	const profile = robotProfile('redbrick-diff-drive-v1');
	assert.equal(profile.topics.cmdVel, '/cmd_vel');
	assert.equal(profile.topics.camera, '/camera/image_raw/compressed');
	assert.equal(profile.actions.navigateToPose, '/navigate_to_pose');
	assert.equal(robotProfile('unknown').id, 'redbrick-diff-drive-v1');
});

test('rosbridge client connects, subscribes, publishes, calls services, and cancels goals', async () => {
	const states = [];
	const client = new RosbridgeClient((state) => states.push(state));
	await client.connect('ws://192.168.1.50:9090');
	const socket = MockWebSocket.instances.at(-1);
	assert.equal(client.isConnected, true);
	assert.deepEqual(states.slice(0, 2), ['connecting', 'connected']);

	let received;
	const dispose = client.subscribe('/scan', 'sensor_msgs/msg/LaserScan', message => { received = message; }, 100);
	socket.receive({ op: 'publish', topic: '/scan', msg: { ranges: [1, 2] } });
	assert.deepEqual(received, { ranges: [1, 2] });

	client.publish('/cmd_vel', 'geometry_msgs/msg/Twist', { linear: { x: 0.2 } });
	assert.equal(socket.sent.filter(message => message.op === 'advertise').length, 1);
	assert.equal(socket.sent.find(message => message.op === 'publish').topic, '/cmd_vel');

	const responsePromise = client.callService('/rosapi/nodes', 'rosapi/srv/Nodes', {});
	const request = socket.sent.find(message => message.op === 'call_service');
	socket.receive({ op: 'service_response', id: request.id, service: request.service, result: true, values: { nodes: ['/robot'] } });
	assert.deepEqual(await responsePromise, { nodes: ['/robot'] });

	const goalId = client.sendActionGoal('/navigate_to_pose', 'nav2_msgs/action/NavigateToPose', { pose: {} });
	client.cancelActionGoal('/navigate_to_pose', goalId);
	assert.equal(socket.sent.find(message => message.op === 'send_action_goal').action, '/navigate_to_pose');
	assert.equal(socket.sent.find(message => message.op === 'cancel_action_goal').id, goalId);

	dispose();
	assert.equal(socket.sent.at(-1).op, 'unsubscribe');
	client.disconnect();
	assert.equal(client.isConnected, false);
});

test('robot control UI exposes every requested page and safety control', () => {
	const fs = require('node:fs');
	const vm = require('node:vm');
	const path = require('node:path');
	const module = { exports: {} };
	const vscode = { l10n: { t: value => value }, Uri: { joinPath: (base, ...parts) => path.join(base, ...parts) } };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../out/robotControlWebview.js'), 'utf8'), { exports: module.exports, require: name => name === 'vscode' ? vscode : require(name) });
	const html = module.exports.robotControlHtml({ cspSource: 'vscode-webview:', asWebviewUri: value => value }, '/extension');
	for (const page of ['Dashboard', 'Remote Control', 'Camera', 'Mapping', 'Navigation', 'Sensors', 'System']) {
		assert.match(html, new RegExp(`>${page}<`));
	}
	assert.match(html, /Emergency Stop/);
	assert.match(html, /robot-control.js/);
	assert.match(html, /settingsForm/);
	new vm.Script(fs.readFileSync(path.join(__dirname, '../media/robot-control.js'), 'utf8'));
});

test('robot settings validate names, finite speeds and IPv6 endpoints without mutating base profiles', () => {
	const { validateRobotSettings, configuredProfile, robotUrl } = require('../out/robotConfiguration.js');
	const settings = validateRobotSettings({ host: '[::1]', port: 9090, secure: true, profileId: 'generic-diff-drive', customization: { topics: { cmdVel: '/robot/cmd_vel' }, limits: { linear: 0.2 } } });
	assert.equal(robotUrl(settings), 'wss://[::1]:9090');
	assert.equal(configuredProfile(settings).topics.cmdVel, '/robot/cmd_vel');
	assert.equal(robotProfile('generic-diff-drive').topics.cmdVel, '/cmd_vel');
	assert.throws(() => validateRobotSettings({ ...settings, port: 0 }));
	assert.throws(() => validateRobotSettings({ ...settings, host: 'ws://robot:9090' }));
	assert.throws(() => validateRobotSettings({ ...settings, customization: { limits: { linear: Infinity } } }));
	assert.throws(() => validateRobotSettings({ ...settings, customization: { topics: { cmdVel: '/bad topic' } } }));
});

test('late close from a previous WebSocket cannot disconnect the current robot', async () => {
	const client = new RosbridgeClient(() => {});
	await client.connect('ws://first:9090');
	const oldSocket = MockWebSocket.instances.at(-1);
	await client.connect('ws://second:9090');
	oldSocket.onclose({ code: 1006, reason: 'late close' });
	assert.equal(client.isConnected, true);
	client.disconnect();
});

test('disconnect during connection rejects the pending promise immediately', async () => {
	const client = new RosbridgeClient(() => {});
	const pending = client.connect('ws://offline:9090');
	client.disconnect();
	await assert.rejects(pending, /cancelled/);
});
