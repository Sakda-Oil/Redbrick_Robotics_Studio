/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Redbrick Robotics Co., Ltd. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const test = require('node:test');
const assert = require('node:assert/strict');
const { composeFqbn, filterBoards, findBoardByFqbn, isLikelyUploadPort, parseFqbnOptions } = require('../out/boardModel.js');
const { remoteUploadAdapterFor } = require('../out/remote/remoteUploadAdapter.js');

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

test('remote upload adapters cover initial and OpenOCD-ready board families', () => {
	const esp32 = remoteUploadAdapterFor('esp32:esp32:esp32');
	assert.deepEqual([
		esp32.family,
		remoteUploadAdapterFor('esp8266:esp8266:nodemcuv2').family,
		remoteUploadAdapterFor('arduino:avr:uno').family,
		remoteUploadAdapterFor('STMicroelectronics:stm32:GenF4').openOcdReady,
		remoteUploadAdapterFor('rp2040:rp2040:rpipico').openOcdReady,
		esp32.compileArgs('esp32:esp32:esp32', '/tmp/job/build', '/tmp/job/Blink'),
		esp32.uploadArgs('esp32:esp32:esp32', '/tmp/job/build', '/tmp/job/Blink', '/dev/ttyUSB0', [])
	], [
		'esp32', 'esp8266', 'avr', true, true,
		['compile', '--fqbn', 'esp32:esp32:esp32', '--build-path', '/tmp/job/build', '/tmp/job/Blink'],
		['upload', '--port', '/dev/ttyUSB0', '--fqbn', 'esp32:esp32:esp32', '--input-dir', '/tmp/job/build', '/tmp/job/Blink']
	]);
});
