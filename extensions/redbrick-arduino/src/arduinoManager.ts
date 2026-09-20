/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ArduinoCli } from './cli/arduinoCli';
import { ArduinoState } from './arduinoState';

export interface IArduinoManagerBoard {
	readonly name: string;
	readonly fqbn: string;
	readonly platform?: { readonly name?: string; readonly installed?: string };
}

interface IPlatformRelease {
	readonly name?: string;
	readonly version?: string;
	readonly boards?: readonly { readonly name: string }[];
}

interface IPlatform {
	readonly id: string;
	readonly maintainer?: string;
	readonly releases?: Readonly<Record<string, IPlatformRelease>>;
	readonly installed_version?: string;
	readonly latest_version?: string;
}

interface IPlatformSearch {
	readonly platforms?: readonly IPlatform[];
}

interface ILibrarySearchEntry {
	readonly name: string;
	readonly available_versions?: readonly string[];
	readonly latest?: {
		readonly author?: string;
		readonly maintainer?: string;
		readonly version?: string;
		readonly sentence?: string;
		readonly paragraph?: string;
		readonly website?: string;
		readonly category?: string;
		readonly architectures?: readonly string[];
	};
}

interface ILibrarySearch {
	readonly libraries?: readonly ILibrarySearchEntry[];
}

interface ILibraryList {
	readonly installed_libraries?: readonly {
		readonly library: { readonly name: string; readonly version?: string };
	}[];
}

type ManagerKind = 'boards' | 'libraries' | 'configuration';

interface IWebviewMessage {
	readonly command: string;
	readonly query?: string;
	readonly id?: string;
	readonly name?: string;
	readonly version?: string;
	readonly url?: string;
	readonly fqbn?: string;
	readonly option?: string;
	readonly value?: string;
}

export class ArduinoManager implements vscode.Disposable {
	private readonly panels = new Map<ManagerKind, vscode.WebviewPanel>();
	private readonly stateListener: vscode.Disposable;

	constructor(
		private readonly cli: ArduinoCli,
		private readonly state: ArduinoState,
		private readonly openSelector: () => void
	) {
		this.stateListener = state.onDidChange(() => {
			const panel = this.panels.get('configuration');
			if (panel) { void this.postConfiguration(panel); }
		});
	}

	showBoardManager(): void {
		this.show('boards', vscode.l10n.t('Arduino Board Manager'));
	}

	showLibraryManager(): void {
		this.show('libraries', vscode.l10n.t('Arduino Library Manager'));
	}

	showBoardConfiguration(): void {
		this.show('configuration', vscode.l10n.t('Arduino Board Configuration'));
	}

	dispose(): void {
		this.stateListener.dispose();
		for (const panel of this.panels.values()) {
			panel.dispose();
		}
		this.panels.clear();
	}

	private show(kind: ManagerKind, title: string): void {
		const existing = this.panels.get(kind);
		if (existing) {
			existing.reveal(vscode.ViewColumn.Active);
			return;
		}

		const panel = vscode.window.createWebviewPanel(`redbrickArduino.${kind}`, title, vscode.ViewColumn.Active, {
			enableScripts: true,
			retainContextWhenHidden: true
		});
		this.panels.set(kind, panel);
		panel.webview.html = this.getHtml(panel.webview, kind);
		panel.onDidDispose(() => this.panels.delete(kind));
		panel.webview.onDidReceiveMessage(message => {
			void this.handleMessage(kind, panel, message as IWebviewMessage).catch(error => {
				void panel.webview.postMessage({ command: 'error', message: error instanceof Error ? error.message : String(error) });
			});
		});
	}

	private async handleMessage(kind: ManagerKind, panel: vscode.WebviewPanel, message: IWebviewMessage): Promise<void> {
		switch (message.command) {
			case 'ready':
				if (kind === 'configuration') { await this.postConfiguration(panel); }
				else { await this.load(kind, panel, message.query?.trim() ?? ''); }
				break;
			case 'search':
				await this.load(kind, panel, message.query?.trim() ?? '');
				break;
			case 'refresh':
				await this.withProgress(vscode.l10n.t('Updating Arduino indexes…'), async token => {
					if (kind === 'boards') {
						await this.cli.run(['core', 'update-index'], token);
					} else {
						await this.cli.run(['lib', 'update-index'], token);
					}
				});
				await this.load(kind, panel, message.query?.trim() ?? '');
				break;
			case 'install':
				await this.install(kind, message);
				await this.load(kind, panel, message.query?.trim() ?? '');
				break;
			case 'remove':
				await this.remove(kind, message);
				await this.load(kind, panel, message.query?.trim() ?? '');
				break;
			case 'addUrl':
				await this.addUrl(message.url);
				await this.load('boards', panel, message.query?.trim() ?? '');
				break;
			case 'changeBoard':
			case 'changePort':
				this.openSelector();
				break;
			case 'setBoardOption': {
				if (message.option && message.value !== undefined) { await this.state.setBoardOption(message.option, message.value); }
				break;
			}
			case 'resetOptions':
				await this.state.resetBoardOptions();
				break;
		}
	}

	private async load(kind: ManagerKind, panel: vscode.WebviewPanel, query: string): Promise<void> {
		await panel.webview.postMessage({ command: 'loading', value: true });
		try {
			if (kind === 'boards') {
				const args = ['core', 'search'];
				if (query) {
					args.push(query);
				}
				args.push('--format', 'json');
				const result = await this.cli.runJson<IPlatformSearch>(args);
				const items = (result.platforms ?? []).map(platform => {
					const versions = Object.keys(platform.releases ?? {}).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
					const latest = platform.latest_version || versions[0];
					const release = latest ? platform.releases?.[latest] : undefined;
					return {
						id: platform.id,
						name: release?.name || platform.id,
						maintainer: platform.maintainer || '',
						installed: platform.installed_version || '',
						latest: latest || '',
						versions,
						boards: release?.boards?.map(board => board.name).join(', ') || ''
					};
				});
				await panel.webview.postMessage({ command: 'data', kind, items });
			} else if (kind === 'libraries') {
				const [search, installed] = await Promise.all([
					this.cli.runJson<ILibrarySearch>(['lib', 'search', query, '--format', 'json', '--omit-releases-details']),
					this.cli.runJson<ILibraryList>(['lib', 'list', '--format', 'json'])
				]);
				const installedVersions = new Map((installed.installed_libraries ?? []).map(entry => [entry.library.name.toLocaleLowerCase(), entry.library.version || '']));
				const items = (search.libraries ?? []).map(library => ({
					name: library.name,
					author: library.latest?.author || library.latest?.maintainer || '',
					category: library.latest?.category || '',
					description: library.latest?.sentence || '',
					website: library.latest?.website || '',
					architectures: library.latest?.architectures?.join(', ') || '',
					installed: installedVersions.get(library.name.toLocaleLowerCase()) || '',
					latest: library.latest?.version || '',
					versions: [...(library.available_versions ?? [])].reverse()
				}));
				await panel.webview.postMessage({ command: 'data', kind, items });
			} else {
				await this.postConfiguration(panel);
			}
		} finally {
			await panel.webview.postMessage({ command: 'loading', value: false });
		}
	}

	private async install(kind: ManagerKind, message: IWebviewMessage): Promise<void> {
		if (kind === 'boards' && message.id) {
			const target = message.version ? `${message.id}@${message.version}` : message.id;
			await this.withProgress(vscode.l10n.t('Installing board platform {0}…', target), token => this.cli.run(['core', 'install', target], token).then(() => undefined));
			await this.state.refreshBoards(true);
		} else if (kind === 'libraries' && message.name) {
			const target = message.version ? `${message.name}@${message.version}` : message.name;
			await this.withProgress(vscode.l10n.t('Installing library {0}…', target), token => this.cli.run(['lib', 'install', target], token).then(() => undefined));
		}
	}

	private async remove(kind: ManagerKind, message: IWebviewMessage): Promise<void> {
		if (kind === 'boards' && message.id) {
			const id = message.id;
			await this.withProgress(vscode.l10n.t('Removing board platform {0}…', id), token => this.cli.run(['core', 'uninstall', id], token).then(() => undefined));
			await this.state.refreshBoards(true);
		} else if (kind === 'libraries' && message.name) {
			const name = message.name;
			await this.withProgress(vscode.l10n.t('Removing library {0}…', name), token => this.cli.run(['lib', 'uninstall', name], token).then(() => undefined));
		}
	}

	private async addUrl(url: string | undefined): Promise<void> {
		const normalized = url?.trim();
		if (!normalized) {
			return;
		}
		let parsed: vscode.Uri;
		try {
			parsed = vscode.Uri.parse(normalized, true);
		} catch {
			throw new Error(vscode.l10n.t('Enter a valid HTTP or HTTPS URL.'));
		}
		if ((parsed.scheme !== 'https' && parsed.scheme !== 'http') || !parsed.authority) {
			throw new Error(vscode.l10n.t('Enter a valid HTTP or HTTPS URL.'));
		}
		await this.withProgress(vscode.l10n.t('Adding Board Manager URL…'), async token => {
			await this.cli.run(['config', 'add', 'board_manager.additional_urls', normalized], token);
			await this.cli.run(['core', 'update-index'], token);
		});
	}

	private async postConfiguration(panel: vscode.WebviewPanel): Promise<void> {
		const snapshot = this.state.snapshot;
		await panel.webview.postMessage({
			command: 'configurationState',
			board: snapshot.selectedBoard ? { ...snapshot.selectedBoard, fqbn: snapshot.selectedFqbn } : undefined,
			port: snapshot.selectedPort ? {
				address: snapshot.selectedPort.port.address,
				label: snapshot.selectedPort.port.label,
				protocol: snapshot.selectedPort.port.protocol_label || snapshot.selectedPort.port.protocol
			} : undefined,
			unavailablePort: snapshot.unavailablePort,
			options: snapshot.boardOptions,
			values: snapshot.boardOptionValues,
			loading: snapshot.loadingBoardDetails,
			error: snapshot.error
		});
	}

	private async withProgress(title: string, task: (token: vscode.CancellationToken) => Promise<void>): Promise<void> {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, (_progress, token) => task(token));
	}

	private getHtml(webview: vscode.Webview, kind: ManagerKind): string {
		if (kind === 'configuration') {
			return this.getConfigurationHtml(webview);
		}
		const nonce = randomBytes(16).toString('base64');
		const labels = JSON.stringify({
			search: vscode.l10n.t('Filter your search…'),
			refresh: kind === 'boards' ? vscode.l10n.t('Refresh Package Indexes') : vscode.l10n.t('Refresh Library Index'),
			additionalUrls: vscode.l10n.t('Additional URLs'),
			add: vscode.l10n.t('Add URL'),
			urlPlaceholder: 'https://example.com/package_vendor_index.json',
			install: vscode.l10n.t('Install'),
			update: vscode.l10n.t('Update'),
			remove: vscode.l10n.t('Remove'),
			installed: vscode.l10n.t('INSTALLED'),
			all: vscode.l10n.t('All'),
			category: vscode.l10n.t('Category'),
			selectBoard: vscode.l10n.t('Select your board'),
			selected: vscode.l10n.t('Selected'),
			loading: vscode.l10n.t('Loading Arduino data…'),
			empty: vscode.l10n.t('No matching items were found.'),
			totalBoards: vscode.l10n.t('Boards'),
			totalLibraries: vscode.l10n.t('Libraries')
		}).replace(/</g, '\\u003c');
		return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
:root{color-scheme:light dark}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:18px}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;background:var(--vscode-editor-background);padding:0 0 14px;z-index:2}.toolbar input,.toolbar select,.card select{box-sizing:border-box;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);padding:7px 9px}.toolbar input{flex:1;min-width:220px}.toolbar select{min-width:150px}button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:7px 12px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}button:disabled{opacity:.55;cursor:default}.link{color:var(--vscode-textLink-foreground);background:transparent;padding:3px 0}.url-row{display:none;gap:8px;width:100%}.url-row.visible{display:flex}.url-row input{flex:1}.status{padding:10px 0;color:var(--vscode-descriptionForeground)}.status.error{color:var(--vscode-errorForeground)}.cards{display:grid;gap:10px}.card{border:1px solid var(--vscode-panel-border);padding:13px;background:var(--vscode-sideBar-background)}.title{font-size:14px;font-weight:600}.meta{color:var(--vscode-descriptionForeground);margin-left:5px}.badge{color:var(--vscode-testing-iconPassed);font-weight:600;margin-left:7px}.description{margin:6px 0;line-height:1.45}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.actions select{min-width:140px}.summary{display:flex;justify-content:space-between;margin-top:14px;color:var(--vscode-descriptionForeground)}.config{max-width:760px;border:1px solid var(--vscode-panel-border);padding:18px}.config label{display:inline-block;width:145px;font-weight:600}.config select{min-width:360px;max-width:calc(100% - 160px);padding:8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent)}.board-search{display:flex;gap:12px;align-items:center;margin-bottom:12px}.board-search input{box-sizing:border-box;flex:1;padding:8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent)}
</style></head><body>
<div id="manager"><div class="toolbar"><select id="category"><option value="">All</option></select><input id="search" type="search"><button id="searchButton">Search</button><button id="refresh" class="link"></button><button id="urls" class="link"></button><div id="urlRow" class="url-row"><input id="urlInput" type="url"><button id="addUrl"></button></div></div><div id="status" class="status"></div><div id="cards" class="cards"></div><div id="summary" class="summary"></div></div>
<div id="configuration" class="config" hidden><div class="board-search"><label for="boardSearch"></label><input id="boardSearch" type="search"></div><select id="boardSelect" size="12"></select><span id="selectedState" class="badge"></span></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(),kind=${JSON.stringify(kind)},labels=${labels};let items=[],busy=false;const manager=document.getElementById('manager'),configuration=document.getElementById('configuration'),search=document.getElementById('search'),category=document.getElementById('category'),cards=document.getElementById('cards'),status=document.getElementById('status'),summary=document.getElementById('summary');
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}function post(command,extra={}){vscode.postMessage({command,query:search.value,...extra})}function versionSelect(versions,latest){const select=el('select');for(const version of versions.length?versions:[latest]){if(!version)continue;const option=el('option','',version);option.value=version;select.appendChild(option)}return select}
function render(){cards.replaceChildren();const needle=search.value.toLocaleLowerCase(),cat=category.value;const filtered=items.filter(item=>(!needle||[item.name,item.id,item.author,item.maintainer,item.description,item.boards].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle))&&(!cat||item.category===cat));for(const item of filtered.slice(0,500)){const card=el('section','card'),heading=el('div','title',item.name||item.id);if(item.author||item.maintainer)heading.appendChild(el('span','meta','by '+(item.author||item.maintainer)));if(item.installed)heading.appendChild(el('span','badge',labels.installed+' '+item.installed));card.appendChild(heading);const description=item.description||item.boards;if(description)card.appendChild(el('div','description',description));if(item.architectures)card.appendChild(el('div','meta',item.architectures));const actions=el('div','actions'),versions=versionSelect(item.versions||[],item.latest);actions.appendChild(versions);const install=el('button','',item.installed?(item.installed===versions.value?labels.install:labels.update):labels.install);install.disabled=busy||Boolean(item.installed&&item.installed===versions.value);install.addEventListener('click',()=>post('install',kind==='boards'?{id:item.id,version:versions.value}:{name:item.name,version:versions.value}));actions.appendChild(install);if(item.installed){const remove=el('button','secondary',labels.remove);remove.disabled=busy;remove.addEventListener('click',()=>post('remove',kind==='boards'?{id:item.id}:{name:item.name}));actions.appendChild(remove)}card.appendChild(actions);cards.appendChild(card)}summary.textContent=filtered.length+' '+(kind==='boards'?labels.totalBoards:labels.totalLibraries)+(filtered.length>500?' (showing first 500)':'');if(!filtered.length&&!busy)status.textContent=labels.empty}
function setData(data){items=data.items||[];status.textContent='';if(kind==='libraries'){const categories=[...new Set(items.map(item=>item.category).filter(Boolean))].sort();category.replaceChildren(new Option(labels.all,''),...categories.map(value=>new Option(value,value)))}render()}
if(kind==='configuration'){manager.hidden=true;configuration.hidden=false;const boardSearch=document.getElementById('boardSearch'),select=document.getElementById('boardSelect');let boardItems=[],selectedBoard='';configuration.querySelector('label').textContent=labels.search;boardSearch.placeholder=labels.search;const renderBoardChoices=()=>{const needle=boardSearch.value.trim().toLocaleLowerCase(),base=selectedBoard.split(':').slice(0,3).join(':');const visible=boardItems.filter(board=>!needle||(board.name+' '+board.fqbn).toLocaleLowerCase().includes(needle));select.replaceChildren(new Option(labels.selectBoard,''),...visible.map(board=>new Option(board.name+' — '+board.fqbn,board.fqbn,false,board.fqbn.split(':').slice(0,3).join(':')===base)))};boardSearch.addEventListener('input',renderBoardChoices);boardSearch.addEventListener('keydown',event=>{if(event.key==='Enter'&&select.options.length===2){select.selectedIndex=1;select.dispatchEvent(new Event('change'))}});window.addEventListener('message',event=>{const msg=event.data;if(msg.command==='loading'){document.getElementById('selectedState').textContent=msg.value?labels.loading:'';configuration.querySelectorAll('select').forEach(control=>control.disabled=msg.value)}else if(msg.command==='data'){boardItems=msg.items||[];selectedBoard=msg.selected||'';renderBoardChoices();document.getElementById('selectedState').textContent=msg.selected?labels.selected:'';document.getElementById('boardOptions')?.remove();const optionsContainer=el('div');optionsContainer.id='boardOptions';for(const config of msg.options||[]){const row=el('div'),label=el('label','',config.option_label),input=el('select');row.style.padding='12px 0';label.htmlFor='option-'+config.option;input.id=label.htmlFor;for(const value of config.values){input.appendChild(new Option(value.value_label,value.value,false,Boolean(value.selected)))}input.addEventListener('change',()=>{configuration.querySelectorAll('select').forEach(control=>control.disabled=true);post('setBoardOption',{fqbn:msg.selected,option:config.option,value:input.value})});row.append(label,input);optionsContainer.appendChild(row)}configuration.appendChild(optionsContainer);configuration.querySelectorAll('select').forEach(control=>control.disabled=false)}else if(msg.command==='selected'){document.getElementById('selectedState').textContent=labels.selected}else if(msg.command==='error'){document.getElementById('selectedState').textContent=msg.message;configuration.querySelectorAll('select').forEach(control=>control.disabled=false)}});select.addEventListener('change',event=>post('selectBoard',{fqbn:event.target.value}));post('ready')}else{search.placeholder=labels.search;document.getElementById('refresh').textContent=labels.refresh;document.getElementById('urls').textContent=labels.additionalUrls;document.getElementById('addUrl').textContent=labels.add;document.getElementById('urlInput').placeholder=labels.urlPlaceholder;if(kind==='libraries')document.getElementById('urls').hidden=true;document.getElementById('searchButton').addEventListener('click',()=>post('search'));search.addEventListener('keydown',event=>{if(event.key==='Enter')post('search')});search.addEventListener('input',render);category.addEventListener('change',render);document.getElementById('refresh').addEventListener('click',()=>post('refresh'));document.getElementById('urls').addEventListener('click',()=>document.getElementById('urlRow').classList.toggle('visible'));document.getElementById('addUrl').addEventListener('click',()=>post('addUrl',{url:document.getElementById('urlInput').value}));window.addEventListener('message',event=>{const msg=event.data;if(msg.command==='loading'){busy=msg.value;status.className='status';status.textContent=busy?labels.loading:'';render()}else if(msg.command==='data')setData(msg);else if(msg.command==='error'){busy=false;status.className='status error';status.textContent=msg.message;render()}});post('ready')}
</script></body></html>`;
	}

	private getConfigurationHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('base64');
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
*{box-sizing:border-box}body{margin:0;padding:20px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}main{max-width:760px;margin:auto}h1{font-size:18px;margin:0 0 18px}.section-title{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--vscode-descriptionForeground);margin:18px 0 8px}.card{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:13px 14px;border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}.primary{font-weight:600}.secondary{font-size:12px;color:var(--vscode-descriptionForeground);margin-top:3px;overflow-wrap:anywhere}.change,.reset{border:0;background:transparent;color:var(--vscode-textLink-foreground);cursor:pointer;white-space:nowrap}.options{max-height:440px;overflow:auto;border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}.option{display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,1.2fr);align-items:center;gap:14px;padding:11px 14px;border-bottom:1px solid var(--vscode-panel-border)}.option:last-child{border-bottom:0}.option label{font-weight:600}.option select{width:100%;padding:7px 9px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent)}.empty{padding:20px;color:var(--vscode-descriptionForeground);text-align:center}.footer{display:flex;justify-content:flex-end;padding:10px 0}.loading{color:var(--vscode-descriptionForeground);padding:8px 0}.error{color:var(--vscode-errorForeground);padding:8px 0}@media(max-width:560px){.option{grid-template-columns:1fr}}
</style></head><body><main><h1>Arduino Board Configuration</h1><div id="status"></div><div class="section-title">Selected Board</div><section id="board" class="card"></section><div class="section-title">Serial Port</div><section id="port" class="card"></section><div class="section-title">Board Options</div><section id="options" class="options"></section><div class="footer"><button id="reset" class="reset">Reset to Defaults</button></div></main>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(),status=document.getElementById('status'),boardEl=document.getElementById('board'),portEl=document.getElementById('port'),optionsEl=document.getElementById('options'),reset=document.getElementById('reset');function div(className,value){const node=document.createElement('div');node.className=className;node.textContent=value||'';return node}function changeButton(label,command){const button=document.createElement('button');button.className='change';button.textContent=label+' ›';button.onclick=()=>vscode.postMessage({command});return button}function render(msg){status.className=msg.error?'error':'loading';status.textContent=msg.error|| (msg.loading?'Loading Arduino configuration…':'');boardEl.replaceChildren();const boardText=document.createElement('div');if(msg.board){boardText.append(div('primary',msg.board.name),div('secondary',msg.board.fqbn),div('secondary',[msg.board.platform?.name,msg.board.platform?.vendor].filter(Boolean).join(' · ')))}else boardText.append(div('primary','No Board Selected'),div('secondary','Select a board before Verify or Upload.'));boardEl.append(boardText,changeButton('Change','changeBoard'));portEl.replaceChildren();const portText=document.createElement('div');if(msg.port){portText.append(div('primary',msg.port.address),div('secondary',msg.port.protocol||msg.port.label||'Serial port'))}else if(msg.unavailablePort){portText.append(div('primary',msg.unavailablePort+' is unavailable'),div('secondary','Reconnect the board or select another port.'))}else portText.append(div('primary','No Port'),div('secondary','A port is optional for Verify and required for Upload.'));portEl.append(portText,changeButton('Change','changePort'));optionsEl.replaceChildren();if(!msg.board){optionsEl.append(div('empty','Select a board to load its options.'))}else if(!msg.options?.length){optionsEl.append(div('empty','This board has no configurable options.'))}else for(const option of msg.options){const row=div('option'),label=document.createElement('label'),select=document.createElement('select');label.textContent=option.option_label;label.htmlFor='option-'+option.option;select.id=label.htmlFor;for(const value of option.values)select.append(new Option(value.value_label,value.value,false,(msg.values||{})[option.option]===value.value));select.onchange=()=>{select.disabled=true;vscode.postMessage({command:'setBoardOption',option:option.option,value:select.value})};row.append(label,select);optionsEl.append(row)}reset.disabled=!msg.board||!msg.options?.length}window.addEventListener('message',event=>{const msg=event.data;if(msg.command==='configurationState')render(msg);else if(msg.command==='error'){status.className='error';status.textContent=msg.message}});reset.onclick=()=>vscode.postMessage({command:'resetOptions'});vscode.postMessage({command:'ready'});
</script></body></html>`;
	}
}
