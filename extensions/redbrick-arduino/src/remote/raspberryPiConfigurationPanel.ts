/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ArduinoUploadMode, IRaspberryPiSettings, RaspberryPiService } from './raspberryPiService';

interface IConfigurationMessage {
	readonly command: 'ready' | 'browseKey' | 'save' | 'test';
	readonly mode?: ArduinoUploadMode;
	readonly host?: string;
	readonly username?: string;
	readonly sshKeyPath?: string;
	readonly sshPort?: number;
	readonly cliPath?: string;
	readonly temporaryRoot?: string;
}

export class RaspberryPiConfigurationPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;

	constructor(private readonly service: RaspberryPiService, private readonly onSaved: () => Promise<void>) { }

	show(): void {
		if (this.panel) { this.panel.reveal(vscode.ViewColumn.Active); void this.postState(); return; }
		const panel = vscode.window.createWebviewPanel('redbrickArduino.raspberryPi', vscode.l10n.t('Raspberry Pi Upload'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
		this.panel = panel;
		panel.webview.html = this.html(panel.webview);
		panel.onDidDispose(() => this.panel = undefined);
		panel.webview.onDidReceiveMessage(message => void this.handle(message as IConfigurationMessage).catch(error => {
			void panel.webview.postMessage({ command: 'result', ok: false, message: error instanceof Error ? error.message : String(error) });
		}));
	}

	dispose(): void { this.panel?.dispose(); }

	private async handle(message: IConfigurationMessage): Promise<void> {
		switch (message.command) {
			case 'ready': await this.postState(); break;
			case 'browseKey': {
				const selection = await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFiles: true, canSelectFolders: false, title: vscode.l10n.t('Select Raspberry Pi SSH Private Key') });
				if (selection?.[0]) { await this.panel?.webview.postMessage({ command: 'key', value: selection[0].fsPath }); }
				break;
			}
			case 'save':
				await this.save(message);
				await this.panel?.webview.postMessage({ command: 'result', ok: true, message: vscode.l10n.t('Raspberry Pi upload settings saved.') });
				await this.onSaved();
				break;
			case 'test': {
				const settings = this.settingsFrom(message);
				await this.panel?.webview.postMessage({ command: 'testing', value: true });
				try {
					const details = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Testing Raspberry Pi connection…'), cancellable: true }, (_progress, token) => this.service.testConnection(settings, token));
					await this.panel?.webview.postMessage({ command: 'result', ok: true, message: vscode.l10n.t('Connected successfully. {0}', details.replace(/\s+/g, ' ')) });
				} finally {
					await this.panel?.webview.postMessage({ command: 'testing', value: false });
				}
				break;
			}
		}
	}

	private async save(message: IConfigurationMessage): Promise<void> {
		const configuration = vscode.workspace.getConfiguration('redbrickArduino');
		const settings = this.settingsFrom(message);
		await configuration.update('upload.mode', message.mode ?? 'local', vscode.ConfigurationTarget.Global);
		await configuration.update('remote.host', settings.host, vscode.ConfigurationTarget.Global);
		await configuration.update('remote.username', settings.username, vscode.ConfigurationTarget.Global);
		await configuration.update('remote.sshKeyPath', settings.sshKeyPath, vscode.ConfigurationTarget.Global);
		await configuration.update('remote.sshPort', settings.sshPort, vscode.ConfigurationTarget.Global);
		await configuration.update('remote.cliPath', settings.cliPath, vscode.ConfigurationTarget.Global);
		await configuration.update('remote.temporaryRoot', settings.temporaryRoot, vscode.ConfigurationTarget.Global);
	}

	private settingsFrom(message: IConfigurationMessage): IRaspberryPiSettings {
		return {
			host: message.host?.trim() ?? '',
			username: message.username?.trim() || 'pi',
			sshKeyPath: message.sshKeyPath?.trim() ?? '',
			sshPort: Number(message.sshPort) || 22,
			cliPath: message.cliPath?.trim() || 'arduino-cli',
			temporaryRoot: message.temporaryRoot?.trim() || '/tmp/redbrick-arduino'
		};
	}

	private async postState(): Promise<void> {
		await this.panel?.webview.postMessage({ command: 'state', mode: this.service.uploadMode, ...this.service.readSettings() });
	}

	private html(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('base64');
		const labels = JSON.stringify({
			title: vscode.l10n.t('Raspberry Pi Remote Upload'), mode: vscode.l10n.t('Upload Mode'), local: vscode.l10n.t('Local'), raspberryPi: vscode.l10n.t('Raspberry Pi'),
			host: vscode.l10n.t('IP Address or Hostname'), username: vscode.l10n.t('SSH Username'), key: vscode.l10n.t('SSH Private Key'), browse: vscode.l10n.t('Browse…'),
			port: vscode.l10n.t('SSH Port'), cli: vscode.l10n.t('Arduino CLI Path on Pi'), temporaryRoot: vscode.l10n.t('Temporary Root on Pi'),
			test: vscode.l10n.t('Test Connection'), save: vscode.l10n.t('Save Settings'), security: vscode.l10n.t('Redbrick uses SSH key authentication only and never stores a plaintext password.')
		}).replace(/</g, '\\u003c');
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><style>
*{box-sizing:border-box}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:24px}main{max-width:720px;margin:auto}h1{font-size:20px;margin:0 0 8px}.intro{color:var(--vscode-descriptionForeground);margin:0 0 22px}.form{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:18px}.row{display:grid;grid-template-columns:190px 1fr;gap:14px;align-items:center;margin:0 0 14px}.row label{font-weight:600}.row input,.row select{width:100%;padding:8px 9px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent)}.key{display:flex;gap:8px}.key button,.actions button{border:0;padding:8px 13px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.actions .secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button:disabled{opacity:.55}.security{margin-top:14px;padding:10px;border-left:3px solid var(--vscode-testing-iconPassed);color:var(--vscode-descriptionForeground)}#result{margin-top:14px;white-space:pre-wrap}.error{color:var(--vscode-errorForeground)}.success{color:var(--vscode-testing-iconPassed)}@media(max-width:560px){.row{grid-template-columns:1fr;gap:5px}}
</style></head><body><main><h1 id="title"></h1><p class="intro">PC / Mac / Windows → SSH / LAN / Wi-Fi → Raspberry Pi 5 → USB → Arduino</p><section class="form"><div class="row"><label for="mode" id="modeLabel"></label><select id="mode"><option value="local"></option><option value="raspberryPi"></option></select></div><div id="remote"><div class="row"><label for="host" id="hostLabel"></label><input id="host" placeholder="raspberrypi.local"></div><div class="row"><label for="username" id="usernameLabel"></label><input id="username"></div><div class="row"><label for="sshKeyPath" id="keyLabel"></label><div class="key"><input id="sshKeyPath"><button id="browse" type="button"></button></div></div><div class="row"><label for="sshPort" id="portLabel"></label><input id="sshPort" type="number" min="1" max="65535"></div><div class="row"><label for="cliPath" id="cliLabel"></label><input id="cliPath"></div><div class="row"><label for="temporaryRoot" id="temporaryRootLabel"></label><input id="temporaryRoot"></div><div class="security" id="security"></div></div><div id="result"></div><div class="actions"><button id="test" class="secondary" type="button"></button><button id="save" type="button"></button></div></section></main><script nonce="${nonce}">
const vscode=acquireVsCodeApi(),labels=${labels},ids=['host','username','sshKeyPath','sshPort','cliPath','temporaryRoot'];for(const [id,key] of [['title','title'],['modeLabel','mode'],['hostLabel','host'],['usernameLabel','username'],['keyLabel','key'],['portLabel','port'],['cliLabel','cli'],['temporaryRootLabel','temporaryRoot'],['browse','browse'],['test','test'],['save','save'],['security','security']])document.getElementById(id).textContent=labels[key];document.querySelector('#mode option[value=local]').textContent=labels.local;document.querySelector('#mode option[value=raspberryPi]').textContent=labels.raspberryPi;const mode=document.getElementById('mode'),result=document.getElementById('result'),payload=()=>({command:'save',mode:mode.value,...Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]))});function toggle(){document.getElementById('remote').hidden=mode.value==='local';document.getElementById('test').disabled=mode.value==='local'}mode.onchange=toggle;document.getElementById('browse').onclick=()=>vscode.postMessage({command:'browseKey'});document.getElementById('save').onclick=()=>vscode.postMessage(payload());document.getElementById('test').onclick=()=>vscode.postMessage({...payload(),command:'test'});window.addEventListener('message',event=>{const msg=event.data;if(msg.command==='state'){mode.value=msg.mode;for(const id of ids)document.getElementById(id).value=msg[id]??'';toggle()}else if(msg.command==='key')document.getElementById('sshKeyPath').value=msg.value;else if(msg.command==='testing'){document.querySelectorAll('button,input,select').forEach(node=>node.disabled=msg.value);if(!msg.value)toggle()}else if(msg.command==='result'){result.className=msg.ok?'success':'error';result.textContent=msg.message}});vscode.postMessage({command:'ready'});
</script></body></html>`;
	}
}
