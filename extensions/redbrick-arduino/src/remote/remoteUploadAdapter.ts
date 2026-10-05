/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readdirSync } from 'fs';
import { basename, join, posix } from 'path';

export type RemoteBoardFamily = 'esp32' | 'esp8266' | 'avr' | 'stm32' | 'rp2040' | 'generic';

export interface IRemoteUploadPlan {
	readonly family: RemoteBoardFamily;
	readonly openOcdReady: boolean;
	readonly localFiles: readonly string[];
	command(remoteBuildPath: string, port: string, baudOverride?: number): readonly string[];
}

function filesIn(buildPath: string): readonly string[] {
	return readdirSync(buildPath, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(buildPath, entry.name));
}

function requireFile(files: readonly string[], predicate: (file: string) => boolean, description: string): string {
	const result = files.find(predicate);
	if (!result) { throw new Error(`Compiled ${description} was not found. Verify the sketch locally before remote upload.`); }
	return result;
}

function remote(remoteBuildPath: string, file: string): string { return posix.join(remoteBuildPath, basename(file)); }

function uploadSpeed(fqbn: string, fallback: number): number {
	const match = /(?:^|[:,])UploadSpeed=(\d+)/i.exec(fqbn);
	return match ? Number(match[1]) : fallback;
}

function esp32Plan(fqbn: string, buildPath: string): IRemoteUploadPlan {
	const files = filesIn(buildPath);
	const merged = files.find(file => /\.merged\.bin$/i.test(file));
	if (merged) {
		return {
			family: 'esp32', openOcdReady: false, localFiles: [merged],
			command: (remoteBuildPath, port, baudOverride) => ['python3', '-m', 'esptool', '--chip', 'auto', '--port', port, '--baud', String(baudOverride ?? uploadSpeed(fqbn, 921600)), '--before', 'default-reset', '--after', 'hard-reset', 'write-flash', '0x0', remote(remoteBuildPath, merged)]
		};
	}
	const bootloader = requireFile(files, file => /\.bootloader\.bin$/i.test(file), 'ESP32 bootloader');
	const partitions = requireFile(files, file => /\.partitions\.bin$/i.test(file), 'ESP32 partition table');
	const application = requireFile(files, file => /\.bin$/i.test(file) && !/\.(?:bootloader|partitions|merged)\.bin$/i.test(file) && !/boot_app0\.bin$/i.test(file), 'ESP32 application');
	const bootApp = files.find(file => /boot_app0\.bin$/i.test(file));
	const chipBootOffset = /(?:esp32s2|esp32s3|esp32c[236]|esp32h2)/i.test(fqbn) ? '0x0' : '0x1000';
	const localFiles = [bootloader, partitions, ...(bootApp ? [bootApp] : []), application];
	return {
		family: 'esp32', openOcdReady: false, localFiles,
		command: (remoteBuildPath, port, baudOverride) => [
			'python3', '-m', 'esptool', '--chip', 'auto', '--port', port, '--baud', String(baudOverride ?? uploadSpeed(fqbn, 921600)), '--before', 'default-reset', '--after', 'hard-reset', 'write-flash',
			chipBootOffset, remote(remoteBuildPath, bootloader), '0x8000', remote(remoteBuildPath, partitions),
			...(bootApp ? ['0xe000', remote(remoteBuildPath, bootApp)] : []), '0x10000', remote(remoteBuildPath, application)
		]
	};
}

function esp8266Plan(fqbn: string, buildPath: string): IRemoteUploadPlan {
	const firmware = requireFile(filesIn(buildPath), file => /\.bin$/i.test(file) && !/\.(?:elf|map)\.bin$/i.test(file), 'ESP8266 firmware');
	return {
		family: 'esp8266', openOcdReady: false, localFiles: [firmware],
		command: (remoteBuildPath, port, baudOverride) => ['python3', '-m', 'esptool', '--chip', 'esp8266', '--port', port, '--baud', String(baudOverride ?? uploadSpeed(fqbn, 460800)), '--before', 'default-reset', '--after', 'hard-reset', 'write-flash', '0x0', remote(remoteBuildPath, firmware)]
	};
}

function avrPlan(fqbn: string, buildPath: string): IRemoteUploadPlan {
	const firmware = requireFile(filesIn(buildPath), file => /\.hex$/i.test(file) && !/with_bootloader/i.test(file), 'AVR HEX firmware');
	const normalized = fqbn.toLowerCase();
	let part = 'atmega328p';
	let protocol = 'arduino';
	let baud = 115200;
	if (normalized.includes(':mega')) { part = 'atmega2560'; protocol = 'wiring'; }
	else if (normalized.includes(':leonardo') || normalized.includes(':micro')) { part = 'atmega32u4'; protocol = 'avr109'; baud = 57600; }
	else if (normalized.includes(':nano') && /cpu=atmega328old/i.test(fqbn)) { baud = 57600; }
	return {
		family: 'avr', openOcdReady: false, localFiles: [firmware],
		command: (remoteBuildPath, port, baudOverride) => ['avrdude', '-V', '-p', part, '-c', protocol, '-P', port, '-b', String(baudOverride ?? baud), '-D', `-Uflash:w:${remote(remoteBuildPath, firmware)}:i`]
	};
}

/** Creates a transport-only upload plan. Compilation and libraries remain on the Studio computer. */
export function remoteUploadPlanFor(fqbn: string, buildPath: string): IRemoteUploadPlan {
	const normalized = fqbn.toLowerCase();
	if (normalized.startsWith('esp32:') || normalized.includes(':esp32:')) { return esp32Plan(fqbn, buildPath); }
	if (normalized.startsWith('esp8266:') || normalized.includes(':esp8266:')) { return esp8266Plan(fqbn, buildPath); }
	if (normalized.startsWith('arduino:avr:') || normalized.includes(':avr:')) { return avrPlan(fqbn, buildPath); }
	if (/stm32|ststm32/.test(normalized)) { throw new Error('STM32 remote transport is reserved for the OpenOCD adapter and is not enabled yet.'); }
	if (/rp2040|rp2350|mbed_rp2040/.test(normalized)) { throw new Error('RP2040 remote transport is reserved for the OpenOCD adapter and is not enabled yet.'); }
	throw new Error(`Remote transport does not have an upload adapter for ${fqbn}.`);
}
