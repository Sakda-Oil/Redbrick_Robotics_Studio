/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, extname, join } from 'path';
import { existsSync } from 'fs';
import * as vscode from 'vscode';
import { ArduinoPaths } from '../platform/arduinoPaths';
import { ensureProjectConfiguration } from './projectConfiguration';

const sketchTemplate = `void setup() {
	// Configure pins and initialize libraries here.
}

void loop() {
	// Add the program logic that should repeat here.
}
`;

export async function createArduinoProject(): Promise<void> {
	const name = await vscode.window.showInputBox({
		prompt: vscode.l10n.t('Enter a name for the new Arduino sketch'),
		placeHolder: 'MyArduinoProject',
		validateInput: value => /^[A-Za-z0-9_-]+$/.test(value) ? undefined : vscode.l10n.t('Use only letters, numbers, underscores, and hyphens.')
	});
	if (!name) {
		return;
	}

	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		defaultUri: vscode.Uri.file(ArduinoPaths.detect().sketchbook),
		openLabel: vscode.l10n.t('Create Project Here'),
		title: vscode.l10n.t('Select the Arduino Sketchbook or Parent Folder')
	});
	if (!selected?.length) {
		return;
	}

	const projectUri = vscode.Uri.joinPath(selected[0], name);
	try {
		await vscode.workspace.fs.stat(projectUri);
		throw new Error(vscode.l10n.t('A file or folder named {0} already exists.', name));
	} catch (error) {
		if (error instanceof Error && !/FileNotFound|EntryNotFound/i.test(error.name + error.message)) {
			throw error;
		}
	}

	await vscode.workspace.fs.createDirectory(projectUri);
	await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(projectUri, `${name}.ino`), new TextEncoder().encode(sketchTemplate));
	await ensureProjectConfiguration(projectUri);
	await vscode.commands.executeCommand('vscode.openFolder', projectUri, false);
}

export async function initializeArduinoProject(): Promise<void> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders?.length) { await createArduinoProject(); return; }
	const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
	if (!folder) { return; }
	const entries = await vscode.workspace.fs.readDirectory(folder.uri);
	const sketches = entries.filter(([name, type]) => type === vscode.FileType.File && ['.ino', '.pde'].includes(extname(name).toLowerCase())).map(([name]) => vscode.Uri.joinPath(folder.uri, name));
	let uri: vscode.Uri | undefined;
	if (sketches.length === 1) {
		uri = sketches[0];
	} else if (sketches.length > 1) {
		const selected = await vscode.window.showQuickPick(sketches.map(candidate => ({ label: basename(candidate.fsPath), uri: candidate })), { placeHolder: vscode.l10n.t('Select the main Arduino sketch') });
		uri = selected?.uri;
	} else {
		const suggested = basename(folder.uri.fsPath).replace(/[^A-Za-z0-9_-]/g, '_') || 'sketch';
		const name = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Enter the main Arduino sketch name'),
			value: suggested,
			validateInput: value => /^[A-Za-z0-9_-]+$/.test(value) ? undefined : vscode.l10n.t('Use only letters, numbers, underscores, and hyphens.')
		});
		if (!name) { return; }
		uri = vscode.Uri.joinPath(folder.uri, `${name}.ino`);
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(sketchTemplate));
	}
	if (!uri) { return; }
	await ensureProjectConfiguration(folder.uri, undefined, basename(uri.fsPath));
	await vscode.window.showTextDocument(uri);
	await vscode.window.showInformationMessage(vscode.l10n.t('Arduino project initialized: {0}', basename(uri.fsPath)));
}

export async function openArduinoProject(): Promise<void> {
	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		defaultUri: vscode.Uri.file(ArduinoPaths.detect().sketchbook),
		openLabel: vscode.l10n.t('Open Arduino Project')
	});
	if (selected?.length) {
		await vscode.commands.executeCommand('vscode.openFolder', selected[0], false);
	}
}

export async function findSketchDirectory(): Promise<string | undefined> {
	const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
	if (activeFile && ['.ino', '.pde'].includes(extname(activeFile).toLowerCase())) {
		return dirname(activeFile);
	}

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const expectedSketch = join(folder.uri.fsPath, `${basename(folder.uri.fsPath)}.ino`);
		if (existsSync(expectedSketch)) {
			return folder.uri.fsPath;
		}
	}

	const sketches = await vscode.workspace.findFiles('**/*.{ino,pde}', '**/{node_modules,.git}/**', 50);
	if (!sketches.length) {
		await vscode.window.showWarningMessage(vscode.l10n.t('No Arduino sketch was found in the current workspace.'));
		return undefined;
	}
	if (sketches.length === 1) {
		return dirname(sketches[0].fsPath);
	}

	const selected = await vscode.window.showQuickPick(sketches.map(uri => ({
		label: basename(uri.fsPath),
		description: vscode.workspace.asRelativePath(uri),
		uri
	})), { placeHolder: vscode.l10n.t('Select the Arduino sketch to use') });
	return selected ? dirname(selected.uri.fsPath) : undefined;
}
