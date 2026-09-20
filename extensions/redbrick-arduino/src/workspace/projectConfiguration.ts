/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { basename } from 'path';

/** Create the same project files used by vscode-arduino without replacing unrelated settings. */
export async function ensureProjectConfiguration(folder: vscode.Uri, fqbn?: string, sketchFile?: string): Promise<void> {
	const config = vscode.Uri.joinPath(folder, '.vscode');
	await vscode.workspace.fs.createDirectory(config);
	const parts = fqbn?.split(':');
	const arduinoUri = vscode.Uri.joinPath(config, 'arduino.json');
	let existingArduino: Record<string, unknown> = {};
	try { existingArduino = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(arduinoUri))) as Record<string, unknown>; }
	catch (error) {
		if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') { throw error; }
	}
	const arduino = {
		...existingArduino,
		sketch: sketchFile || existingArduino.sketch || `${basename(folder.fsPath)}.ino`,
		...(parts ? { board: parts.slice(0, 3).join(':'), configuration: parts.slice(3).join(':') } : {})
	};
	await vscode.workspace.fs.writeFile(arduinoUri, new TextEncoder().encode(JSON.stringify(arduino, null, '\t') + '\n'));
	const files = {
		'c_cpp_properties.json': { configurations: [{ name: 'Arduino', compileCommands: '${workspaceFolder}/compile_commands.json' }], version: 4 },
		'settings.json': { 'files.associations': { '*.ino': 'arduino', '*.pde': 'arduino' } }
	};
	for (const [name, data] of Object.entries(files)) {
		const uri = vscode.Uri.joinPath(config, name);
		try { await vscode.workspace.fs.stat(uri); continue; }
		catch (error) {
			if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') { throw error; }
		}
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(data, null, '\t') + '\n'));
	}
}
