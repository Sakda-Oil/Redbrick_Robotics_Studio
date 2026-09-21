/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type RemoteBoardFamily = 'esp32' | 'esp8266' | 'avr' | 'stm32' | 'rp2040' | 'generic';

export interface IRemoteUploadAdapter {
	readonly id: string;
	readonly family: RemoteBoardFamily;
	readonly openOcdReady: boolean;
	compileArgs(fqbn: string, buildPath: string, sketchPath: string): readonly string[];
	uploadArgs(fqbn: string, buildPath: string, sketchPath: string, port: string | undefined, programmerArgs: readonly string[]): readonly string[];
}

class ArduinoCliRemoteAdapter implements IRemoteUploadAdapter {
	readonly id = 'arduino-cli';

	constructor(readonly family: RemoteBoardFamily, readonly openOcdReady: boolean) { }

	compileArgs(fqbn: string, buildPath: string, sketchPath: string): readonly string[] {
		return ['compile', '--fqbn', fqbn, '--build-path', buildPath, sketchPath];
	}

	uploadArgs(fqbn: string, buildPath: string, sketchPath: string, port: string | undefined, programmerArgs: readonly string[]): readonly string[] {
		return ['upload', ...(port ? ['--port', port] : []), '--fqbn', fqbn, '--input-dir', buildPath, ...programmerArgs, sketchPath];
	}
}

/** Selects the remote upload adapter without changing the existing Arduino CLI workflow. */
export function remoteUploadAdapterFor(fqbn: string): IRemoteUploadAdapter {
	const normalized = fqbn.toLocaleLowerCase();
	if (normalized.startsWith('esp32:')) { return new ArduinoCliRemoteAdapter('esp32', false); }
	if (normalized.startsWith('esp8266:')) { return new ArduinoCliRemoteAdapter('esp8266', false); }
	if (normalized.startsWith('arduino:avr:') || normalized.includes(':avr:')) { return new ArduinoCliRemoteAdapter('avr', false); }
	if (/stm32|ststm32/.test(normalized)) { return new ArduinoCliRemoteAdapter('stm32', true); }
	if (/rp2040|rp2350|mbed_rp2040/.test(normalized)) { return new ArduinoCliRemoteAdapter('rp2040', true); }
	return new ArduinoCliRemoteAdapter('generic', false);
}
