/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class RobotActions implements vscode.TreeDataProvider<vscode.TreeItem> {
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

	getChildren(): vscode.TreeItem[] {
		return [
			this.item('Open Robot Control', 'dashboard', 'redbrickRobotControl.open'),
			this.item('Connect to Robot', 'radio-tower', 'redbrickRobotControl.connect'),
			this.item('Disconnect Robot', 'debug-disconnect', 'redbrickRobotControl.disconnect'),
			this.item('Export Robot Setup Package', 'export', 'redbrickRobotControl.exportRobotSetup'),
			this.item('Emergency Stop', 'error', 'redbrickRobotControl.emergencyStop')
		];
	}

	private item(label: string, icon: string, command: string): vscode.TreeItem {
		const item = new vscode.TreeItem(label);
		item.iconPath = new vscode.ThemeIcon(icon);
		item.command = { command, title: label };
		return item;
	}
}
