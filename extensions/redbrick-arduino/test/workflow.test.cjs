/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const extensionRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
const actions = fs.readFileSync(path.join(extensionRoot, 'src', 'arduinoActions.ts'), 'utf8');
const projectConfiguration = fs.readFileSync(path.join(extensionRoot, 'src', 'workspace', 'projectConfiguration.ts'), 'utf8');
const serialMonitor = fs.readFileSync(path.join(extensionRoot, 'src', 'serialMonitorPanel.ts'), 'utf8');
const completionProvider = fs.readFileSync(path.join(extensionRoot, 'src', 'arduinoCompletionProvider.ts'), 'utf8');
const definitionProvider = fs.readFileSync(path.join(extensionRoot, 'src', 'arduinoDefinitionProvider.ts'), 'utf8');

test('Arduino sidebar follows the vscode-arduino command workflow without duplicate board entries', () => {
	const expected = [
		'installCore', 'selectBoard', 'changeTimestampFormat', 'closeSerialMonitor',
		'openExample', 'newProject', 'installLibrary', 'serialMonitor', 'selectPort',
		'upload', 'cliUpload', 'uploadUsingProgrammer', 'cliUploadUsingProgrammer',
		'verify', 'rebuildIntelliSense'
	];
	const actual = [...actions.matchAll(/\['([^']+)', vscode\.l10n\.t/g)].map(match => match[1]);
	assert.deepEqual(actual, expected);
	assert.equal(actual.includes('showBoardSelector'), false);
	assert.equal(actual.includes('boardConfiguration'), false);
});

test('internal combined selector remains available to the toolbar but is hidden from the Command Palette', () => {
	const hidden = new Set(manifest.contributes.menus.commandPalette.filter(item => item.when === 'false').map(item => item.command));
	assert.equal(hidden.has('redbrickArduino.showBoardSelector'), true);
	assert.equal(hidden.has('redbrickArduino.boardConfiguration'), true);
	assert.equal(hidden.has('redbrickArduino.refreshPorts'), true);
});

test('project initialization writes vscode-arduino compatible configuration', () => {
	assert.match(projectConfiguration, /\.vscode/);
	assert.match(projectConfiguration, /'arduino\.json'/);
	assert.doesNotMatch(projectConfiguration, /createDirectory\(redbrick\)/);
});

test('vscode-arduino keyboard shortcuts are contributed', () => {
	const shortcuts = Object.fromEntries(manifest.contributes.keybindings.map(binding => [binding.command, binding.key]));
	assert.equal(shortcuts['redbrickArduino.upload'], 'ctrl+alt+u');
	assert.equal(shortcuts['redbrickArduino.verify'], 'ctrl+alt+r');
	assert.equal(shortcuts['redbrickArduino.rebuildIntelliSense'], 'ctrl+alt+i');
});

test('serial monitor provides interactive controls and releases the Windows port', () => {
	assert.match(serialMonitor, /Start Monitoring/);
	assert.match(serialMonitor, /Line Ending/);
	assert.match(serialMonitor, /Open an Additional Monitor/);
	assert.match(serialMonitor, /View Mode/);
	assert.match(serialMonitor, /Data Bits/);
	assert.match(serialMonitor, /Automatic Reconnection/);
	assert.match(serialMonitor, /refreshPorts/);
	assert.match(serialMonitor, /child\.stdin\.write/);
	assert.match(serialMonitor, /taskkill\.exe/);
	assert.match(serialMonitor, /'\/T', '\/F'/);
});

test('Arduino editing provides command completion and signature help', () => {
	assert.match(completionProvider, /pinMode/);
	assert.match(completionProvider, /digitalWrite/);
	assert.match(completionProvider, /Serial\.println/);
	assert.match(completionProvider, /CompletionItemKind\.Snippet/);
	assert.match(completionProvider, /provideSignatureHelp/);
	assert.equal(manifest.contributes.configurationDefaults['[arduino]']['editor.suggestOnTriggerCharacters'], true);
});

test('Arduino symbols support Ctrl+Click and F12 definition navigation', () => {
	assert.match(definitionProvider, /DefinitionProvider/);
	assert.match(definitionProvider, /paths\.sketchbook/);
	assert.match(definitionProvider, /paths\.data/);
	assert.match(definitionProvider, /ripgrep-universal/);
	assert.match(definitionProvider, /Arduino15|packages/);
	assert.match(fs.readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf8'), /registerDefinitionProvider/);
});
