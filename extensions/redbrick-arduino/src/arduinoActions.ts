/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export class ArduinoActions implements vscode.TreeDataProvider<vscode.TreeItem> {
	getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }
	getChildren(): vscode.TreeItem[] {
		return [
			['installCore', vscode.l10n.t('Board Manager'), 'package'],
			['selectBoard', vscode.l10n.t('Change Board Type'), 'circuit-board'],
			['changeTimestampFormat', vscode.l10n.t('Change Timestamp Format'), 'clock'],
			['closeSerialMonitor', vscode.l10n.t('Close Serial Monitor'), 'debug-stop'],
			['openExample', vscode.l10n.t('Examples'), 'book'],
			['newProject', vscode.l10n.t('New Arduino Project'), 'new-folder'],
			['installLibrary', vscode.l10n.t('Library Manager'), 'library'],
			['serialMonitor', vscode.l10n.t('Open Serial Monitor'), 'terminal'],
			['selectPort', vscode.l10n.t('Select Serial Port'), 'plug'],
			['upload', vscode.l10n.t('Upload'), 'cloud-upload'],
			['cliUpload', vscode.l10n.t('CLI Upload'), 'cloud-upload'],
			['uploadUsingProgrammer', vscode.l10n.t('Upload Using Programmer'), 'circuit-board'],
			['cliUploadUsingProgrammer', vscode.l10n.t('CLI Upload Using Programmer'), 'circuit-board'],
			['verify', vscode.l10n.t('Verify'), 'check'],
			['rebuildIntelliSense', vscode.l10n.t('Rebuild IntelliSense Configuration'), 'symbol-method'],
		].map(([id, label, icon]) => {
			const item = new vscode.TreeItem(label);
			item.iconPath = new vscode.ThemeIcon(icon);
			item.command = { command: `redbrickArduino.${id}`, title: label };
			return item;
		});
	}
}
