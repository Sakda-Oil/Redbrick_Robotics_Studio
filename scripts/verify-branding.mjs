/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'icon-tools', 'package.json'));
const sharp = require('sharp');

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const product = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'product.json'), 'utf8'));
const expected = {
	nameLong: 'Redbrick Robotics Studio',
	nameShort: 'Redbrick Robotics Studio',
	companyName: 'Redbrick Robotics Co., Ltd.',
	applicationName: 'redbrick-robotics-studio',
	win32DirName: 'Redbrick',
	darwinBundleIdentifier: 'com.redbrickrobotics.studio',
	linuxIconName: 'redbrick-robotics-studio'
};

for (const [key, value] of Object.entries(expected)) {
	assert.equal(product[key], value, `Unexpected product.${key}`);
}

assert.equal(product.extensionsGallery?.serviceUrl, 'https://open-vsx.org/vscode/gallery', 'Unexpected extension gallery');
assert.equal(product.extensionsGallery?.verifySignature, false, 'Open VSX must not use the Microsoft Marketplace signature verifier');

const requiredAssets = [
	'resources/branding/icon.png',
	'resources/win32/code.ico',
	'resources/darwin/code.icns',
	'resources/linux/code.png',
	'src/vs/workbench/browser/media/code-icon.png',
	'extensions/redbrick-arduino/media/icon.png',
	...([16, 32, 48, 64, 128, 256, 512].map(size => `resources/linux/hicolor/${size}x${size}/apps/redbrick-robotics-studio.png`))
];
for (const asset of requiredAssets) {
	assert.ok(fs.existsSync(path.join(repositoryRoot, asset)), `Missing ${asset}`);
}

const ico = fs.readFileSync(path.join(repositoryRoot, 'resources/win32/code.ico'));
assert.equal(ico.readUInt16LE(2), 1, 'Invalid ICO type');
assert.equal(ico.readUInt16LE(4), 7, 'Windows ICO must contain seven sizes');
assert.deepEqual(Array.from({ length: 7 }, (_, index) => ico.readUInt8(6 + index * 16) || 256), [16, 24, 32, 48, 64, 128, 256]);

const icns = fs.readFileSync(path.join(repositoryRoot, 'resources/darwin/code.icns'));
assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns', 'Invalid ICNS header');
assert.equal(icns.readUInt32BE(4), icns.length, 'Invalid ICNS length');
for (const type of ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10']) {
	assert.ok(icns.includes(Buffer.from(type, 'ascii')), `Missing ICNS chunk ${type}`);
}

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
	const metadata = await sharp(path.join(repositoryRoot, `resources/linux/hicolor/${size}x${size}/apps/redbrick-robotics-studio.png`)).metadata();
	assert.equal(metadata.width, size, `Unexpected ${size}px Linux icon width`);
	assert.equal(metadata.height, size, `Unexpected ${size}px Linux icon height`);
}

const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(
	digest(path.join(repositoryRoot, 'Icon.png')),
	digest(path.join(repositoryRoot, 'resources/branding/icon.png')),
	'Branding master copy differs from Icon.png'
);

console.log('Redbrick product identity and generated application icons are valid.');
