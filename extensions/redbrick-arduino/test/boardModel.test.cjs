/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Redbrick Robotics Co., Ltd. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { composeFqbn, filterBoards, findBoardByFqbn, isLikelyUploadPort, parseFqbnOptions } = require('../out/boardModel.js');
const { remoteUploadPlanFor } = require('../out/remote/remoteUploadAdapter.js');

test('board selection survives dynamic option suffixes', () => {
	const boards = [{ name: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' }];
	assert.equal(findBoardByFqbn(boards, 'esp32:esp32:esp32:FlashMode=dio,UploadSpeed=115200'), boards[0]);
});

test('board search matches all terms across name and FQBN without rendering the entire database', () => {
	const boards = Array.from({ length: 1500 }, (_, index) => ({ name: `Board ${index}`, fqbn: `vendor:arch:board-${index}` }));
	boards.push({ name: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' });
	assert.deepEqual(filterBoards(boards, 'esp32 dev').map(board => board.name), ['ESP32 Dev Module']);
	assert.equal(filterBoards(boards, '').length, 120);
});

test('FQBN board options round-trip', () => {
	const options = { UploadSpeed: '115200', FlashFreq: '40' };
	const fqbn = composeFqbn('esp32:esp32:nodemcu-32s', options);
	assert.equal(fqbn, 'esp32:esp32:nodemcu-32s:UploadSpeed=115200,FlashFreq=40');
	assert.deepEqual(parseFqbnOptions(fqbn), options);
});

test('Bluetooth virtual COM ports are not treated as connected upload boards', () => {
	assert.equal(isLikelyUploadPort({ port: { address: 'COM7', protocol_label: 'Serial Port', properties: {} } }), false);
	assert.equal(isLikelyUploadPort({ port: { address: 'COM13', protocol_label: 'Serial Port', properties: { vid: '10C4', pid: 'EA60' } } }), true);
});

test('remote bridge creates an esptool plan from locally compiled ESP32 firmware', t => {
	const os = require('node:os');
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbrick-bridge-test-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.writeFileSync(path.join(directory, 'Blink.ino.merged.bin'), 'firmware');
	const plan = remoteUploadPlanFor('esp32:esp32:esp32:UploadSpeed=460800', directory);
	assert.equal(plan.family, 'esp32');
	assert.deepEqual(plan.localFiles.map(file => path.basename(file)), ['Blink.ino.merged.bin']);
	assert.deepEqual(plan.command('/tmp/job/build', '/dev/ttyUSB0'), [
		'python3', '-m', 'esptool', '--chip', 'auto', '--port', '/dev/ttyUSB0', '--baud', '460800', '--before', 'default-reset', '--after', 'hard-reset', 'write-flash', '0x0', '/tmp/job/build/Blink.ino.merged.bin'
	]);
});

test('remote bridge supports locally compiled ESP8266 and AVR firmware', t => {
	const os = require('node:os');
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbrick-bridge-families-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.writeFileSync(path.join(directory, 'Wifi.ino.bin'), 'firmware');
	const esp8266 = remoteUploadPlanFor('esp8266:esp8266:nodemcuv2', directory);
	assert.equal(esp8266.family, 'esp8266');
	assert.deepEqual(esp8266.command('/tmp/build', '/dev/ttyUSB0').slice(0, 9), ['python3', '-m', 'esptool', '--chip', 'esp8266', '--port', '/dev/ttyUSB0', '--baud', '460800']);

	fs.writeFileSync(path.join(directory, 'Blink.ino.hex'), 'firmware');
	const avr = remoteUploadPlanFor('arduino:avr:uno', directory);
	assert.equal(avr.family, 'avr');
	assert.deepEqual(avr.command('/tmp/build', '/dev/ttyACM0').slice(0, 8), ['avrdude', '-V', '-p', 'atmega328p', '-c', 'arduino', '-P', '/dev/ttyACM0']);
});

test('remote bridge supports 3rd party vendor ESP32 boards such as RB_Nexus', t => {
	const os = require('node:os');
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbrick-bridge-rbnexus-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.writeFileSync(path.join(directory, 'Blink.ino.merged.bin'), 'firmware');
	const plan = remoteUploadPlanFor('RB_Nexus:esp32:rb_nexus:UploadSpeed=921600', directory);
	assert.equal(plan.family, 'esp32');
	assert.deepEqual(plan.command('/tmp/job/build', '/dev/ttyUSB0'), [
		'python3', '-m', 'esptool', '--chip', 'auto', '--port', '/dev/ttyUSB0', '--baud', '921600', '--before', 'default-reset', '--after', 'hard-reset', 'write-flash', '0x0', '/tmp/job/build/Blink.ino.merged.bin'
	]);
});
