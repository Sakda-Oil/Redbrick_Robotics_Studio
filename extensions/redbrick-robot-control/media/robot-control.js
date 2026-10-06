/* Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. */
(() => {
	'use strict';
	const vscode = acquireVsCodeApi();
	const $ = id => document.getElementById(id);
	const all = selector => [...document.querySelectorAll(selector)];
	const post = (type, data = {}) => vscode.postMessage({ type, ...data });
	let connected = false, estopped = false, initialized = false, activePage = 'dashboard';
	let driveTimer, driveKey, latestCamera, latestMap, latestScan, profile, profiles = [], settings;
	let logs = [];
	const topicLabels = { cmdVel: 'Motion / Twist', emergencyStop: 'Emergency Stop', battery: 'Battery', camera: 'Camera / CompressedImage', scan: 'LiDAR / LaserScan', map: 'Map / OccupancyGrid', odom: 'Odometry', diagnostics: 'Diagnostics', logs: 'ROS Logs', systemStatus: 'System Status', navigationGoal: 'Navigation Gateway Goal', navigationCancel: 'Navigation Gateway Cancel', navigationStatus: 'Navigation Gateway Status' };
	const serviceLabels = { saveMap: 'Save Map Service', slamLifecycle: 'SLAM Lifecycle Service' };
	const canvases = ['dashboardCanvas', 'mappingCanvas', 'navigationCanvas', 'lidarCanvas'];
	function notice(text, error = false) { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; }
	function showPage(page) {
		stop(); activePage = page;
		all('.page').forEach(el => el.classList.toggle('active', el.id === page));
		all('.tab').forEach(el => { el.classList.toggle('active', el.dataset.page === page); el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false'); });
		resize();
	}
	all('[data-page]').forEach(el => el.onclick = () => showPage(el.dataset.page));
	function controls() {
		all('[data-online]').forEach(el => el.disabled = !connected || (estopped && (el.hasAttribute('data-drive') || el.id === 'startSlam')));
		$('releaseEstop').disabled = !connected || !estopped;
		$('settingsFields').disabled = connected;
		['saveSettings', 'testConnection', 'resetProfile'].forEach(id => $(id).disabled = connected || !initialized);
		$('robotStatus').textContent = estopped ? 'Emergency Stopped' : connected ? 'Connected' : 'Not Connected';
		$('safetyState').textContent = estopped ? 'Emergency stop is active' : connected ? 'Hold to drive • Release to stop' : 'Motion requires a live connection';
	}
	function clearTelemetry() {
		latestCamera = latestMap = latestScan = undefined;
		['cameraImage', 'dashboardCamera'].forEach(id => { $(id).hidden = true; $(id).removeAttribute('src'); });
		all('.map-empty, .camera-empty').forEach(el => el.hidden = false);
		$('battery').textContent = '—'; $('batteryVoltage').textContent = 'Waiting for sensor'; $('resources').textContent = '— / —';
		$('temperature').textContent = 'Waiting for system monitor'; $('scanStatus').textContent = 'Waiting for LiDAR';
		$('mapSummary').textContent = 'No map received';
		['sensorList', 'nodeList', 'topicList'].forEach(id => $(id).replaceChildren());
		resize();
	}
	function connection(state, detail) {
		connected = state === 'connected';
		if (!connected) { stop(); clearTelemetry(); }
		$('statusText').textContent = state.charAt(0).toUpperCase() + state.slice(1);
		$('statusText').className = 'badge ' + state;
		$('connect').textContent = connected ? 'Disconnect' : state === 'connecting' ? 'Connecting…' : 'Connect';
		$('connect').disabled = !initialized || state === 'connecting';
		$('dashConnection').textContent = connected ? 'Online' : 'Offline';
		if (detail) { notice(detail, state === 'error'); }
		else if (initialized) { notice(connected ? 'Connected. Robot services must be running to use each feature.' : 'Disconnected. Connect when the robot is ready.'); }
		controls();
	}
	function fillProfile(value) {
		profile = value;
		$('limitLinear').value = value.limits.linear; $('limitAngular').value = value.limits.angular; $('mapFrame').value = value.frames.map;
		$('linearSpeed').max = value.limits.linear; $('angularSpeed').max = value.limits.angular;
		$('linearSpeed').value = Math.min(Number($('linearSpeed').value), value.limits.linear);
		$('angularSpeed').value = Math.min(Number($('angularSpeed').value), value.limits.angular);
		$('motionTopic').textContent = value.topics.cmdVel + ' · geometry_msgs/msg/Twist';
		$('cameraTopic').textContent = value.topics.camera;
		$('systemProfile').textContent = value.name + ' · Map frame: ' + value.frames.map;
		$('topicSettings').replaceChildren();
		for (const [group, labels] of [['topics', topicLabels], ['services', serviceLabels]]) {
			for (const [key, label] of Object.entries(labels)) {
				const wrapper = document.createElement('label'); wrapper.textContent = label;
				const input = document.createElement('input'); input.id = group + '-' + key; input.value = value[group][key]; input.required = true;
				wrapper.append(input); $('topicSettings').append(wrapper);
			}
		}
		speedLabels();
	}
	function formSettings() {
		const topics = {}, services = {};
		for (const key of Object.keys(topicLabels)) { topics[key] = $('topics-' + key).value.trim(); }
		for (const key of Object.keys(serviceLabels)) { services[key] = $('services-' + key).value.trim(); }
		return { host: $('host').value.trim(), port: Number($('port').value), secure: $('secure').checked, profileId: $('profile').value,
			customization: { topics, services, frames: { map: $('mapFrame').value.trim() }, limits: { linear: Number($('limitLinear').value), angular: Number($('limitAngular').value) } } };
	}
	$('settingsForm').onsubmit = event => { event.preventDefault(); post('saveSettings', formSettings()); };
	$('testConnection').onclick = () => {
		if (!$('settingsForm').reportValidity()) { return; }
		$('testConnection').disabled = true; $('testResult').textContent = 'Checking robot connection…'; post('testConnection', formSettings());
	};
	$('profile').onchange = () => fillProfile(profiles.find(item => item.id === $('profile').value));
	$('resetProfile').onclick = () => fillProfile(profiles.find(item => item.id === $('profile').value));
	$('connect').onclick = () => {
		if (connected) { stop(); post('disconnect'); return; }
		if (!settings?.host) { showPage('settings'); $('host').focus(); notice('Enter your robot IP, then save the settings.'); return; }
		post('connect', settings);
	};
	function speedLabels() { $('linearValue').textContent = Number($('linearSpeed').value).toFixed(2) + ' m/s'; $('angularValue').textContent = Number($('angularSpeed').value).toFixed(2) + ' rad/s'; }
	['linearSpeed', 'angularSpeed'].forEach(id => $(id).oninput = speedLabels);
	function motion(linear, angular) {
		if (!connected || estopped) { return; }
		post('motion', { linear: linear * Number($('linearSpeed').value), angular: angular * Number($('angularSpeed').value) });
	}
	function stop() {
		const wasDriving = driveTimer !== undefined;
		clearInterval(driveTimer); driveTimer = undefined; driveKey = undefined;
		all('[data-drive]').forEach(el => el.classList.remove('active'));
		if (connected && wasDriving) { post('motion', { linear: 0, angular: 0 }); }
	}
	function start(linear, angular) {
		stop(); if (!connected || estopped) { return; }
		motion(linear, angular);
		if (linear || angular) { driveTimer = setInterval(() => motion(linear, angular), 100); }
	}
	all('[data-drive]').forEach(button => {
		button.onpointerdown = event => { if (event.button !== 0) { return; } event.preventDefault(); button.setPointerCapture(event.pointerId); start(...button.dataset.drive.split(',').map(Number)); button.classList.add('active'); };
		button.onpointerup = button.onpointercancel = button.onlostpointercapture = stop;
	});
	window.addEventListener('blur', stop);
	window.addEventListener('pagehide', stop);
	document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); } });
	const keys = { ArrowUp: [1, 0], w: [1, 0], ArrowDown: [-1, 0], s: [-1, 0], ArrowLeft: [0, 1], a: [0, 1], ArrowRight: [0, -1], d: [0, -1] };
	window.addEventListener('keydown', event => {
		if (!['dashboard', 'remote-control'].includes(activePage) || event.repeat || event.ctrlKey || event.altKey || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) { return; }
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (keys[key]) { event.preventDefault(); start(...keys[key]); driveKey = key; }
	});
	window.addEventListener('keyup', event => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; if (key === driveKey) { stop(); } });
	$('emergencyStop').onclick = () => { stop(); post('emergencyStop'); };
	$('releaseEstop').onclick = () => post('releaseEmergencyStop');
	$('startSlam').onclick = () => post('slam', { start: true }); $('stopSlam').onclick = () => post('slam', { start: false });
	$('saveMap').onclick = () => post('saveMap', { name: $('mapName').value.trim() });
	$('cancelNav').onclick = () => post('cancelNavigation'); $('refreshGraph').onclick = () => post('refreshGraph');
	$('exportSetup').onclick = () => post('exportSetup');
	$('clearLog').onclick = () => { logs = []; renderLogs(); };
	$('exportLog').onclick = () => post('exportLog', { text: logs.map(entry => entry.text).join('\n') });
	$('cameraSnapshot').onclick = () => { if (latestCamera) { post('saveSnapshot', latestCamera); } else { notice('No camera frame received.', true); } };
	function renderLogs() { $('terminal').textContent = logs.filter(entry => $('logLevel').value === 'all' || entry.level === $('logLevel').value).map(entry => entry.text).join('\n'); $('terminal').scrollTop = $('terminal').scrollHeight; }
	$('logLevel').onchange = renderLogs;
	function list(id, entries) {
		$(id).replaceChildren();
		for (const item of entries.slice(0, 300)) { const row = document.createElement('div'); row.className = 'list-row'; row.textContent = item.name; const detail = document.createElement('small'); detail.textContent = item.type || ''; row.append(detail); $(id).append(row); }
	}
	function resize() {
		requestAnimationFrame(() => canvases.forEach(id => { const canvas = $(id), rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) { return; } canvas.width = Math.round(rect.width * devicePixelRatio); canvas.height = Math.round(rect.height * devicePixelRatio); draw(canvas); }));
	}
	window.addEventListener('resize', resize);
	function transform(canvas) { const m = latestMap.info, scale = Math.min(canvas.width / m.width, canvas.height / m.height); return { m, scale, ox: (canvas.width - m.width * scale) / 2, oy: (canvas.height - m.height * scale) / 2 }; }
	function draw(canvas) {
		const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
		if (canvas.id === 'lidarCanvas') {
			if (!latestScan) { return; }
			const cx = canvas.width / 2, cy = canvas.height / 2, scale = Math.min(canvas.width, canvas.height) / 22;
			ctx.strokeStyle = '#657080'; for (let r = 2; r <= 10; r += 2) { ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI * 2); ctx.stroke(); }
			ctx.fillStyle = '#f05270'; latestScan.ranges.forEach((range, i) => { if (!Number.isFinite(range) || range < latestScan.range_min || range > latestScan.range_max) { return; } const angle = latestScan.angle_min + i * latestScan.angle_increment; ctx.fillRect(cx + Math.cos(angle) * range * scale, cy - Math.sin(angle) * range * scale, 3, 3); }); return;
		}
		if (!latestMap) { return; }
		const { m, scale, ox, oy } = transform(canvas), off = document.createElement('canvas'); off.width = m.width; off.height = m.height;
		const offContext = off.getContext('2d'), image = offContext.createImageData(m.width, m.height);
		for (let y = 0; y < m.height; y++) { for (let x = 0; x < m.width; x++) { const v = latestMap.data[(m.height - y - 1) * m.width + x], c = v < 0 ? 95 : Math.round(238 * (1 - v / 100)), i = (y * m.width + x) * 4; image.data[i] = image.data[i + 1] = image.data[i + 2] = c; image.data[i + 3] = 255; } }
		offContext.putImageData(image, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, ox, oy, m.width * scale, m.height * scale);
	}
	$('navigationCanvas').onclick = event => {
		if (!latestMap || !connected || estopped) { return; }
		const canvas = $('navigationCanvas'), rect = canvas.getBoundingClientRect(), { m, scale, ox, oy } = transform(canvas);
		const mx = ((event.clientX - rect.left) * canvas.width / rect.width - ox) / scale;
		const my = m.height - ((event.clientY - rect.top) * canvas.height / rect.height - oy) / scale;
		if (mx < 0 || my < 0 || mx >= m.width || my >= m.height) { return; }
		const occupancy = latestMap.data[Math.floor(my) * m.width + Math.floor(mx)];
		if (occupancy < 0 || occupancy >= 65) { notice('Choose a known, free map cell.', true); return; }
		const q = m.origin.orientation, angle = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
		const lx = mx * m.resolution, ly = my * m.resolution;
		const yaw = Number($('goalYaw').value) * Math.PI / 180;
		post('navigate', { x: m.origin.position.x + lx * Math.cos(angle) - ly * Math.sin(angle), y: m.origin.position.y + lx * Math.sin(angle) + ly * Math.cos(angle), yaw });
	};
	window.addEventListener('message', event => {
		const msg = event.data;
		if (!connected && ['battery', 'system', 'camera', 'map', 'scan', 'odom', 'graph', 'sensors'].includes(msg.type)) { return; }
		switch (msg.type) {
			case 'initial':
				initialized = true; settings = msg.settings; profiles = msg.profiles; estopped = msg.emergencyStopped;
				$('host').value = settings.host; $('port').value = settings.port; $('secure').checked = settings.secure;
				$('profile').replaceChildren(...profiles.map(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; return option; }));
				$('profile').value = settings.profileId; fillProfile(msg.profile);
				$('endpoint').textContent = settings.host ? settings.host + ':' + settings.port : 'Set Up Robot →'; $('dashIp').textContent = settings.host || 'No robot selected';
				connection(msg.connectionState); notice(settings.host ? 'Ready. Connect to receive live robot data.' : 'Open Settings to enter your robot IP and choose its topics.');
				if (msg.page) { showPage(msg.page); } resize(); break;
			case 'connection': connection(msg.state, msg.detail); break;
			case 'safety': estopped = msg.emergencyStopped; if (estopped) { stop(); } controls(); break;
			case 'showSettings': showPage('settings'); break;
			case 'testResult': $('testResult').textContent = msg.message; $('testConnection').disabled = connected; break;
			case 'battery': { const percent = msg.percentage <= 1 ? msg.percentage * 100 : msg.percentage; $('battery').textContent = Number.isFinite(percent) && percent >= 0 ? percent.toFixed(0) + '%' : '—'; $('batteryVoltage').textContent = Number.isFinite(msg.voltage) ? msg.voltage.toFixed(2) + ' V' : 'Unavailable'; break; }
			case 'system': $('resources').textContent = (msg.cpu ?? '—') + '% / ' + (msg.memory ?? '—') + '%'; $('temperature').textContent = 'Temperature ' + (msg.temperature ?? '—') + ' °C'; if (msg.rosDistro) { $('rosDistro').textContent = 'ROS 2 ' + msg.rosDistro; } break;
			case 'camera': latestCamera = { data: msg.data, format: msg.format }; ['cameraImage', 'dashboardCamera'].forEach(id => { $(id).src = 'data:' + msg.format + ';base64,' + msg.data; $(id).hidden = false; }); all('.camera-empty').forEach(el => el.hidden = true); break;
			case 'map': if (!msg.data?.info || !Number.isInteger(msg.data.info.width) || !Number.isInteger(msg.data.info.height) || msg.data.info.width <= 0 || msg.data.info.height <= 0 || msg.data.info.width * msg.data.info.height > 16000000 || msg.data.data?.length !== msg.data.info.width * msg.data.info.height) { break; } latestMap = msg.data; all('.map-empty').forEach(el => el.hidden = true); $('mapSummary').textContent = msg.data.info.width + ' × ' + msg.data.info.height + ' · ' + msg.data.info.resolution + ' m/cell'; resize(); break;
			case 'scan': if (Array.isArray(msg.data?.ranges)) { latestScan = msg.data; $('scanStatus').textContent = msg.data.ranges.length + ' LiDAR samples'; draw($('lidarCanvas')); } break;
			case 'odom': $('motion').textContent = msg.linear.toFixed(2) + ' m/s · ' + msg.angular.toFixed(2) + ' rad/s'; break;
			case 'graph': list('topicList', msg.topics); list('nodeList', msg.nodes); break;
			case 'sensors': list('sensorList', msg.items); break;
			case 'log': logs.push(msg.entry); if (logs.length > 1000) { logs.shift(); } renderLogs(); break;
			case 'navigation': $('navStatus').textContent = msg.status; break;
			case 'notice': notice(msg.message, msg.error); break;
		}
	});
	controls(); post('ready');
})();
