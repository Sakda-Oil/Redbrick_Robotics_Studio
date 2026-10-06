/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Runs the shipped UI and controller against a local ROS protocol fixture. No hardware commands.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const { WebSocketServer } = require('ws');

test('shipped UI: real WebSocket, settings, drive release, disconnect, map, service errors and E-stop', async t => {
	const root = path.resolve(__dirname, '..');
	const traffic = [], errors = [], commands = [], configuration = {};
	let html = '', receive, page, controller, browser;
	const server = http.createServer((req, res) => {
		if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
		const file = path.basename(req.url);
		if (!['robot-control.js', 'robot-control.css'].includes(file)) { res.writeHead(404).end(); return; }
		res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css');
		res.end(fs.readFileSync(path.join(root, 'media', file)));
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port, origin = `http://127.0.0.1:${port}`;
	const wss = new WebSocketServer({ server });
	const peers = new Set();
	const rosPublish = (topic, msg) => { for (const peer of peers) { peer.send(JSON.stringify({ op: 'publish', topic, msg })); } };
	wss.on('connection', socket => {
		peers.add(socket); socket.on('close', () => peers.delete(socket));
		socket.on('message', data => {
			const msg = JSON.parse(data); traffic.push(msg);
			if (msg.op === 'call_service') {
				let values = {};
				if (msg.service === '/rosapi/topics') { values = { topics: ['/map', '/scan', '/camera/image_raw/compressed'], types: ['nav_msgs/msg/OccupancyGrid', 'sensor_msgs/msg/LaserScan', 'sensor_msgs/msg/CompressedImage'] }; }
				else if (msg.service === '/rosapi/nodes') { values = { nodes: ['/robot_fixture', '/rosbridge_websocket'] }; }
				else if (msg.service === '/rosapi/services') { values = { services: ['/map_saver/save_map'] }; }
				else if (msg.service === '/map_saver/save_map') { values = { result: false }; }
				else if (msg.service === '/slam_toolbox/change_state') { values = { success: false }; }
				socket.send(JSON.stringify({ op: 'service_response', id: msg.id, service: msg.service, result: true, values }));
			}
		});
	});
	const disposable = { dispose() {} };
	class TabInputWebview { viewType = 'redbrickRobotControl.panel'; }
	const uri = p => ({ fsPath: p, toString: () => p });
	const vscode = {
		l10n: { t: (value, ...args) => value.replace(/\{(\d+)\}/g, (_, n) => args[n]) },
		Uri: { joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)), file: uri },
		ViewColumn: { Active: -1 }, ConfigurationTarget: { Global: 1 }, TabInputWebview,
		commands: { executeCommand: async name => commands.push(name) },
		workspace: { getConfiguration: () => ({ get: (key, fallback) => configuration[key] ?? fallback, update: async (key, value) => { configuration[key] = value; } }) },
		window: {
			tabGroups: { activeTabGroup: { activeTab: { input: new TabInputWebview() } } },
			createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
			createWebviewPanel: () => ({
				reveal() {}, dispose() {}, onDidChangeViewState: () => disposable, onDidDispose: () => disposable,
				webview: {
					cspSource: origin, asWebviewUri: resource => uri(origin + '/' + path.basename(resource.fsPath)),
					set html(value) { html = value; },
					onDidReceiveMessage: callback => { receive = callback; return disposable; },
					postMessage: async message => { if (page && !page.isClosed()) { await page.evaluate(msg => window.dispatchEvent(new MessageEvent('message', { data: msg })), message); } return true; }
				}
			})
		}
	};
	const cache = new Map();
	function load(file) {
		if (cache.has(file)) { return cache.get(file); }
		const module = { exports: {} }, originalRequire = createRequire(file);
		const sandbox = { exports: module.exports, module, require: name => name === 'vscode' ? vscode : name.startsWith('./') ? load(path.resolve(path.dirname(file), name + '.js')) : originalRequire(name), setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, console, WebSocket };
		vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file }); cache.set(file, module.exports); return module.exports;
	}
	t.after(async () => { controller?.dispose(); await new Promise(resolve => setTimeout(resolve, 50)); page = undefined; await browser?.close(); for (const peer of peers) { peer.terminate(); } await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); });
	const { RobotControlPanel } = load(path.join(root, 'out', 'robotControlPanel.js'));
	controller = new RobotControlPanel({ extensionUri: uri(root) });
	const opening = controller.show();
	browser = await chromium.launch({ channel: 'msedge', headless: true });
	page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	page.on('pageerror', error => errors.push(error.message));
	await page.exposeFunction('sendToController', message => receive(message));
	await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: message => window.sendToController(message) }); });
	await page.goto(origin);
	await page.waitForFunction(() => document.querySelector('#profile').options.length === 2);
	await opening;
	assert.deepEqual(commands, ['workbench.action.moveEditorToNewWindow']);
	assert.equal(await page.locator('[data-drive="1,0"]').first().isDisabled(), true);
	await page.locator('.tab[data-page="settings"]').click();
	await page.locator('#host').fill('127.0.0.1'); await page.locator('#port').fill(String(port));
	await page.locator('#topics-cmdVel').fill('/robot/cmd_vel');
	await page.locator('#saveSettings').click();
	await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('settings saved'));
	assert.equal(configuration.robotSettings.customization.topics.cmdVel, '/robot/cmd_vel');
	await page.locator('#testConnection').click();
	await page.waitForFunction(() => document.querySelector('#testResult').textContent.includes('Rosbridge connected'));
	assert.equal(traffic.some(msg => msg.op === 'publish'), false, 'Connection test must not move the robot');
	await page.locator('#connect').click();
	await page.waitForFunction(() => document.querySelector('#statusText').textContent === 'Connected');
	await page.locator('.tab[data-page="remote-control"]').click();
	const drive = page.locator('#remote-control [data-drive="1,0"]');
	const box = await drive.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
	await page.waitForTimeout(240); await page.mouse.up(); await page.waitForTimeout(80);
	const twists = () => traffic.filter(msg => msg.op === 'publish' && msg.topic === '/robot/cmd_vel');
	assert.ok(twists().some(msg => msg.msg.linear.x > 0)); assert.equal(twists().at(-1).msg.linear.x, 0);
	await page.mouse.down(); await page.waitForTimeout(120);
	await page.evaluate(() => document.querySelector('.tab[data-page="camera"]').click()); await page.mouse.up(); await page.waitForTimeout(80);
	assert.equal(twists().at(-1).msg.linear.x, 0, 'Switching away from drive stops motion');
	rosPublish('/camera/image_raw/compressed', { format: 'png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2S8AAAAASUVORK5CYII=' });
	await page.waitForFunction(() => !document.querySelector('#cameraImage').hidden);
	const map = { info: { width: 4, height: 4, resolution: 1, origin: { position: { x: 10, y: 20 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } } }, data: Array(16).fill(0) };
	rosPublish('/map', map); await page.waitForFunction(() => document.querySelector('#mapSummary').textContent.includes('4 × 4'));
	await page.locator('.tab[data-page="navigation"]').click();
	const navBox = await page.locator('#navigationCanvas').boundingBox();
	await page.locator('#navigationCanvas').click({ position: { x: navBox.width / 2, y: navBox.height / 2 } });
	await page.waitForTimeout(80);
	const goal = traffic.findLast(msg => msg.topic === '/redbrick/navigation_goal' && msg.op === 'publish');
	assert.ok(goal, 'A free cell should publish a navigation goal');
	assert.ok(Math.abs(goal.msg.pose.position.x - 8) < 0.05 && Math.abs(goal.msg.pose.position.y - 22) < 0.05, 'Map origin rotation must be applied');
	await page.locator('#emergencyStop').click(); await page.waitForFunction(() => document.querySelector('#robotStatus').textContent === 'Emergency Stopped');
	assert.ok(traffic.some(msg => msg.op === 'publish' && msg.topic === '/redbrick/cancel_navigation'));
	const goalsBefore = traffic.filter(msg => msg.topic === '/redbrick/navigation_goal' && msg.op === 'publish').length;
	await page.locator('#navigationCanvas').click({ position: { x: navBox.width / 2, y: navBox.height / 2 } }); await page.waitForTimeout(80);
	assert.equal(traffic.filter(msg => msg.topic === '/redbrick/navigation_goal' && msg.op === 'publish').length, goalsBefore);
	await controller.handle({ type: 'navigate', x: 1, y: 2, yaw: 0 }).then(() => assert.fail('Backend accepted a goal during E-stop'), error => assert.match(error.message, /Emergency Stop/));
	await page.locator('#releaseEstop').click(); await page.waitForFunction(() => document.querySelector('#robotStatus').textContent === 'Connected');
	await controller.handle({ type: 'motion', linear: 0.2, angular: 0 });
	await page.waitForTimeout(650);
	assert.equal(twists().at(-1).msg.linear.x, 0, 'Host dead-man timer stops motion without UI heartbeat');
	await page.locator('.tab[data-page="mapping"]').click(); await page.locator('#saveMap').click();
	await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('could not save'));
	await page.locator('#startSlam').click(); await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('rejected'));
	await page.locator('#connect').click(); await page.waitForFunction(() => document.querySelector('#statusText').textContent === 'Disconnected');
	assert.equal(await page.locator('#cameraImage').getAttribute('src'), null);
	await page.locator('.tab[data-page="dashboard"]').click();
	const artifacts = process.env.ROBOT_UI_ARTIFACTS;
	if (artifacts) { fs.mkdirSync(artifacts, { recursive: true }); await page.screenshot({ path: path.join(artifacts, 'robot-control-desktop.png'), fullPage: true }); }
	await page.setViewportSize({ width: 768, height: 1024 });
	if (artifacts) { await page.screenshot({ path: path.join(artifacts, 'robot-control-tablet.png'), fullPage: true }); }
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Tablet must not overflow horizontally');
	await page.locator('.tab[data-page="settings"]').click();
	if (artifacts) { await page.screenshot({ path: path.join(artifacts, 'robot-control-settings.png'), fullPage: true }); }
	assert.deepEqual(errors, [], 'UI must execute without JavaScript errors');
});
