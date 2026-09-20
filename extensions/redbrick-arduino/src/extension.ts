/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ArduinoController } from './arduinoController';
import { ArduinoPaths } from './platform/arduinoPaths';
import { ArduinoActions } from './arduinoActions';
import { ArduinoCompletionProvider } from './arduinoCompletionProvider';
import { ArduinoDefinitionProvider } from './arduinoDefinitionProvider';

export function activate(context: vscode.ExtensionContext): void {
	const paths = ArduinoPaths.detect();
	context.subscriptions.push(vscode.commands.registerCommand('redbrickArduino.internal.paths', () => paths));
	const controller = new ArduinoController(context);
	context.subscriptions.push(controller);
	controller.registerCommands();
	context.subscriptions.push(vscode.window.registerTreeDataProvider('redbrickArduino.actions', new ArduinoActions()));
	context.subscriptions.push(vscode.commands.registerCommand('redbrickArduino.showActions', () => vscode.commands.executeCommand('workbench.view.extension.redbrickArduino')));
	const completionProvider = new ArduinoCompletionProvider();
	const arduinoDocuments: vscode.DocumentSelector = [
		{ language: 'arduino', scheme: 'file' },
		{ language: 'arduino', scheme: 'untitled' },
		{ language: 'arduino', scheme: 'redbrick-example' }
	];
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(arduinoDocuments, completionProvider, '.'));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(arduinoDocuments, completionProvider, '(', ','));
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(arduinoDocuments, new ArduinoDefinitionProvider(paths)));
}

export function deactivate(): void { }
