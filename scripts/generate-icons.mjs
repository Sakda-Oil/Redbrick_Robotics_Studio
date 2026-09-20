/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'icon-tools', 'package.json'));
const sharp = require('sharp');

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const masterIcon = path.join(repositoryRoot, 'Icon.png');
const windowsSizes = [16, 24, 32, 48, 64, 128, 256];
const macSizes = [16, 32, 64, 128, 256, 512, 1024];
const linuxSizes = [16, 32, 48, 64, 128, 256, 512];

async function resizedPng(size, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
	return sharp(masterIcon)
		.resize(size, size, { fit: 'contain', background })
		.png()
		.toBuffer();
}

function createIco(images) {
	const headerSize = 6;
	const entrySize = 16;
	let imageOffset = headerSize + entrySize * images.length;
	const header = Buffer.alloc(headerSize);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	const entries = images.map(({ size, data }) => {
		const entry = Buffer.alloc(entrySize);
		entry.writeUInt8(size === 256 ? 0 : size, 0);
		entry.writeUInt8(size === 256 ? 0 : size, 1);
		entry.writeUInt8(0, 2);
		entry.writeUInt8(0, 3);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(data.length, 8);
		entry.writeUInt32LE(imageOffset, 12);
		imageOffset += data.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...images.map(image => image.data)]);
}

function createIcns(images) {
	const iconTypes = new Map([
		[16, 'icp4'],
		[32, 'icp5'],
		[64, 'icp6'],
		[128, 'ic07'],
		[256, 'ic08'],
		[512, 'ic09'],
		[1024, 'ic10']
	]);
	const chunks = images.map(({ size, data }) => {
		const chunk = Buffer.alloc(8 + data.length);
		chunk.write(iconTypes.get(size), 0, 4, 'ascii');
		chunk.writeUInt32BE(chunk.length, 4);
		data.copy(chunk, 8);
		return chunk;
	});
	const header = Buffer.alloc(8);
	header.write('icns', 0, 4, 'ascii');
	header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
	return Buffer.concat([header, ...chunks]);
}

async function createBmp(width, height) {
	const { data } = await sharp(masterIcon)
		.resize(width, height, { fit: 'contain', background: '#ffffff' })
		.flatten({ background: '#ffffff' })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const rowSize = Math.ceil(width * 3 / 4) * 4;
	const pixelData = Buffer.alloc(rowSize * height);
	for (let y = 0; y < height; y++) {
		const sourceRow = y * width * 3;
		const destinationRow = (height - y - 1) * rowSize;
		for (let x = 0; x < width; x++) {
			const source = sourceRow + x * 3;
			const destination = destinationRow + x * 3;
			pixelData[destination] = data[source + 2];
			pixelData[destination + 1] = data[source + 1];
			pixelData[destination + 2] = data[source];
		}
	}
	const header = Buffer.alloc(54);
	header.write('BM', 0, 2, 'ascii');
	header.writeUInt32LE(header.length + pixelData.length, 2);
	header.writeUInt32LE(header.length, 10);
	header.writeUInt32LE(40, 14);
	header.writeInt32LE(width, 18);
	header.writeInt32LE(height, 22);
	header.writeUInt16LE(1, 26);
	header.writeUInt16LE(24, 28);
	header.writeUInt32LE(pixelData.length, 34);
	return Buffer.concat([header, pixelData]);
}

async function writeFile(relativePath, data) {
	const target = path.join(repositoryRoot, relativePath);
	await fs.mkdir(path.dirname(target), { recursive: true });
	for (let attempt = 1; ; attempt++) {
		try {
			await fs.writeFile(target, data);
			break;
		} catch (error) {
			if (attempt >= 5 || !['EBUSY', 'EPERM', 'UNKNOWN'].includes(error?.code)) {
				throw error;
			}
			await new Promise(resolve => setTimeout(resolve, attempt * 100));
		}
	}
	console.log(`generated ${relativePath}`);
}

async function main() {
	const metadata = await sharp(masterIcon).metadata();
	assert.equal(metadata.format, 'png', 'Icon.png must be a PNG image');
	assert.equal(metadata.width, metadata.height, 'Icon.png must be square');
	assert.ok((metadata.width ?? 0) >= 1024, 'Icon.png must be at least 1024x1024');

	const masterData = await fs.readFile(masterIcon);
	await writeFile('resources/branding/icon.png', masterData);

	const windowsImages = await Promise.all(windowsSizes.map(async size => ({ size, data: await resizedPng(size) })));
	await writeFile('resources/win32/code.ico', createIco(windowsImages));
	await writeFile('resources/win32/code_70x70.png', await resizedPng(70));
	await writeFile('resources/win32/code_150x150.png', await resizedPng(150));

	const macImages = await Promise.all(macSizes.map(async size => ({ size, data: await resizedPng(size) })));
	await writeFile('resources/darwin/code.icns', createIcns(macImages));

	for (const size of linuxSizes) {
		await writeFile(`resources/linux/hicolor/${size}x${size}/apps/redbrick-robotics-studio.png`, await resizedPng(size));
	}
	await writeFile('resources/linux/code.png', await resizedPng(512));
	await writeFile('src/vs/workbench/browser/media/code-icon.png', await resizedPng(128));
	await writeFile('extensions/redbrick-arduino/media/icon.png', await resizedPng(128));

	const innoAssets = [
		['big', 100, 164, 314], ['big', 125, 192, 386], ['big', 150, 246, 459],
		['big', 175, 273, 556], ['big', 200, 328, 604], ['big', 225, 355, 700],
		['big', 250, 410, 797], ['small', 100, 55, 55], ['small', 125, 64, 68],
		['small', 150, 83, 80], ['small', 175, 92, 97], ['small', 200, 110, 106],
		['small', 225, 119, 123], ['small', 250, 138, 140]
	];
	for (const [kind, scale, width, height] of innoAssets) {
		await writeFile(`resources/win32/inno-${kind}-${scale}.bmp`, await createBmp(width, height));
	}
}

await main();
