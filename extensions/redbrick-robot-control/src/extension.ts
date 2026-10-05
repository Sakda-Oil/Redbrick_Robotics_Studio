/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RobotActions } from './robotActions';
import { RobotControlPanel } from './robotControlPanel';

export function activate(context: vscode.ExtensionContext): void {
	const panel = new RobotControlPanel(context);
	context.subscriptions.push(panel);
	context.subscriptions.push(vscode.window.registerTreeDataProvider('redbrickRobotControl.actions', new RobotActions()));
	context.subscriptions.push(vscode.commands.registerCommand('redbrickRobotControl.open', () => panel.show()));
	context.subscriptions.push(vscode.commands.registerCommand('redbrickRobotControl.connect', () => panel.connectFromCommand()));
	context.subscriptions.push(vscode.commands.registerCommand('redbrickRobotControl.disconnect', () => panel.disconnect()));
	context.subscriptions.push(vscode.commands.registerCommand('redbrickRobotControl.exportRobotSetup', () => panel.exportRobotSetup()));
	context.subscriptions.push(vscode.commands.registerCommand('redbrickRobotControl.emergencyStop', () => panel.emergencyStop()));
}

export function deactivate(): void { }
