/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ArduinoState } from './arduinoState';
import { baseFqbn, filterBoards } from './boardModel';

interface ISelectorMessage {
	readonly command: 'ready' | 'refresh' | 'apply' | 'connected' | 'boardManager' | 'searchPlatforms' | 'installPlatform' | 'cancel';
	readonly boardFqbn?: string;
	readonly boardName?: string;
	readonly portAddress?: string;
	readonly query?: string;
	readonly platformId?: string;
	readonly version?: string;
}

export class BoardSelector implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly stateListener: vscode.Disposable;

	constructor(private readonly state: ArduinoState) {
		this.stateListener = state.onDidChange(() => void this.postState());
	}

	show(): void {
		if (this.panel) { this.panel.reveal(vscode.ViewColumn.Active); void this.postState(); return; }
		const panel = vscode.window.createWebviewPanel('redbrickArduino.boardSelector', vscode.l10n.t('Select Board and Port'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
		this.panel = panel;
		panel.webview.html = this.html(panel.webview);
		panel.onDidDispose(() => this.panel = undefined);
		panel.webview.onDidReceiveMessage(message => void this.handleMessage(message as ISelectorMessage).catch(error => {
			void panel.webview.postMessage({ command: 'error', message: error instanceof Error ? error.message : String(error) });
		}));
	}

	dispose(): void {
		this.stateListener.dispose();
		this.panel?.dispose();
	}

	private async handleMessage(message: ISelectorMessage): Promise<void> {
		switch (message.command) {
			case 'ready':
				await Promise.all([this.state.refreshBoards(true), this.state.refreshPorts(true)]);
				await this.postState();
				break;
			case 'refresh':
				await this.state.refreshPorts();
				break;
			case 'apply':
				if (!message.boardFqbn) { return; }
				await this.state.setBoardByFqbn(message.boardFqbn, message.boardName);
				await this.state.setPort(message.portAddress ? this.state.snapshot.availablePorts.find(port => port.port.address === message.portAddress) : undefined);
				this.panel?.dispose();
				break;
			case 'connected': {
				if (!message.boardFqbn || !message.portAddress) { return; }
				await this.state.setBoardByFqbn(message.boardFqbn, message.boardName);
				await this.state.setPort(this.state.snapshot.availablePorts.find(port => port.port.address === message.portAddress));
				this.panel?.dispose();
				break;
			}
			case 'boardManager':
				await vscode.commands.executeCommand('redbrickArduino.installCore');
				break;
			case 'searchPlatforms': {
				const query = message.query?.trim() ?? '';
				const platforms = await this.state.searchUninstalledPlatforms(query);
				await this.panel?.webview.postMessage({ command: 'platformResults', query, platforms });
				break;
			}
			case 'installPlatform':
				if (message.platformId) {
					await this.state.installPlatform(message.platformId, message.version);
					await this.panel?.webview.postMessage({ command: 'platformInstalled', platformId: message.platformId });
				}
				break;
			case 'cancel':
				this.panel?.dispose();
				break;
		}
	}

	private async postState(): Promise<void> {
		if (!this.panel) { return; }
		const snapshot = this.state.snapshot;
		// Some Windows USB-to-serial drivers expose only a COM address and omit
		// VID/PID metadata. Every port reported by Arduino CLI must stay selectable.
		const ports = snapshot.availablePorts.map(port => ({
			address: port.port.address,
			label: port.port.label || port.port.address,
			protocol: port.port.protocol_label || port.port.protocol || '',
			vid: port.port.properties?.vid || '',
			pid: port.port.properties?.pid || '',
			boards: port.matching_boards ?? []
		}));
		const connected = ports.filter(port => port.boards.length || port.vid || port.pid || /USB|ACM|UART/i.test(`${port.label} ${port.protocol}`));
		await this.panel.webview.postMessage({
			command: 'state',
			boards: filterBoards(snapshot.availableBoards, '', 5000).map(board => ({ ...board, fqbn: baseFqbn(board.fqbn) })),
			ports,
			connected,
			selectedFqbn: snapshot.selectedBoard ? baseFqbn(snapshot.selectedBoard.fqbn) : '',
			selectedPort: snapshot.selectedPort?.port.address || '',
			loadingBoards: snapshot.loadingBoards,
			loadingPorts: snapshot.loadingPorts,
			error: snapshot.error || ''
		});
	}

	private html(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('base64');
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
*{box-sizing:border-box}
body{margin:0;padding:18px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);overflow:hidden}
.shell{max-width:920px;max-height:calc(100vh - 36px);margin:auto;border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);box-shadow:0 8px 28px #0006;display:flex;flex-direction:column;overflow:hidden}
.head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--vscode-panel-border);flex:none}
h1{font-size:16px;margin:0}.connected{padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border);flex:none}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--vscode-descriptionForeground);margin:0 0 8px}
.connected-list{display:grid;gap:6px}.device{display:flex;width:100%;align-items:center;gap:10px;text-align:left;border:1px solid transparent;padding:8px 10px;background:transparent;color:inherit;cursor:pointer}
.device:hover,.device:focus{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-focusBorder)}.dot{width:8px;height:8px;border-radius:50%;background:var(--vscode-testing-iconPassed)}
.primary{font-weight:600}.secondary{font-size:12px;color:var(--vscode-descriptionForeground)}.empty{color:var(--vscode-descriptionForeground);padding:7px 0}
.columns{display:grid;grid-template-columns:1.15fr .85fr;height:420px;min-height:220px;max-height:calc(100vh - 260px);overflow:hidden}
.column{min-width:0;min-height:0;padding:14px 16px;display:flex;flex-direction:column;overflow:hidden}.column+.column{border-left:1px solid var(--vscode-panel-border)}
input[type=search]{width:100%;padding:8px 10px;margin-bottom:8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none;flex:none}input:focus{border-color:var(--vscode-focusBorder)}
.list{overflow:auto;min-height:0;height:0;flex:1 1 0;border:1px solid var(--vscode-panel-border)}
.row{display:block;width:100%;border:0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 60%,transparent);padding:8px 10px;text-align:left;color:inherit;background:transparent;cursor:pointer}
.row:hover,.row:focus{background:var(--vscode-list-hoverBackground);outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}.row.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.row .primary:before{content:' ';display:inline-block;width:15px}.row.selected .primary:before{content:'✓';color:var(--vscode-testing-iconPassed)}.more{padding:8px;color:var(--vscode-descriptionForeground);text-align:center}
.platforms{border:1px solid var(--vscode-panel-border);border-top:0;max-height:130px;overflow:auto;flex:none}.platform{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border)}
.install{align-self:center;border:0;padding:5px 9px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}
.summary{min-height:58px;padding:10px 16px;border-top:1px solid var(--vscode-panel-border);flex:none}.foot{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--vscode-panel-border);flex:none}
.actions{display:flex;gap:8px}button.action{border:0;padding:7px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}button.action:hover{background:var(--vscode-button-hoverBackground)}
button.secondary-button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:disabled{opacity:.5;cursor:default}.link{border:0;background:transparent;color:var(--vscode-textLink-foreground);cursor:pointer}.error{color:var(--vscode-errorForeground)}
@media(max-width:650px){body{overflow:auto}.shell{max-height:none;overflow:visible}.columns{grid-template-columns:1fr;height:auto;max-height:none;overflow:visible}.column{height:260px}.column+.column{border-left:0;border-top:1px solid var(--vscode-panel-border)}}
</style></head><body><main class="shell"><header class="head"><h1>Select Board and Port</h1><button id="close" class="link" title="Close">×</button></header><section class="connected"><h2>Connected Boards</h2><div id="connected" class="connected-list"></div></section><section class="columns"><div class="column"><h2>Boards</h2><input id="boardSearch" type="search" placeholder="Search boards…" autofocus><div id="boards" class="list" role="listbox"></div><div id="platforms" class="platforms" hidden></div></div><div class="column"><h2>Ports</h2><input id="portSearch" type="search" placeholder="Search ports…"><div id="ports" class="list" role="listbox"></div></div></section><section id="summary" class="summary"></section><footer class="foot"><div><button id="refresh" class="link">↻ Refresh ports</button><button id="manager" class="link">Board Manager…</button></div><div class="actions"><button id="cancel" class="action secondary-button">Cancel</button><button id="ok" class="action" disabled>OK</button></div></footer></main>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(),boardSearch=document.getElementById('boardSearch'),portSearch=document.getElementById('portSearch'),boardsEl=document.getElementById('boards'),portsEl=document.getElementById('ports'),platformsEl=document.getElementById('platforms'),connectedEl=document.getElementById('connected'),summary=document.getElementById('summary'),ok=document.getElementById('ok');let data={boards:[],ports:[],connected:[]},platformSuggestions=[],platformTimer,selectedBoard='',selectedBoardName='',selectedPort='';
function text(value){return String(value||'').toLocaleLowerCase()}function sub(parent,className,value){const node=document.createElement('div');node.className=className;node.textContent=value;parent.appendChild(node)}function buttonRow(primary,secondary,selected,onSelect,onDouble){const button=document.createElement('button');button.className='row'+(selected?' selected':'');button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected',String(selected));sub(button,'primary',primary);sub(button,'secondary',secondary);button.onclick=onSelect;if(onDouble)button.ondblclick=onDouble;return button}
function renderBoards(){const terms=text(boardSearch.value).trim().split(/\s+/).filter(Boolean),filtered=data.boards.filter(board=>terms.every(term=>text([board.name,board.fqbn,board.platform?.name,board.platform?.vendor,board.platform?.architecture].join(' ')).includes(term))),visible=filtered.slice(0,120);boardsEl.replaceChildren(...visible.map(board=>buttonRow(board.name,board.fqbn,board.fqbn===selectedBoard,()=>{selectedBoard=board.fqbn;selectedBoardName=board.name;render()},()=>apply())));if(filtered.length>visible.length){const more=document.createElement('div');more.className='more';more.textContent='Showing '+visible.length+' of '+filtered.length+'. Keep typing to narrow the list.';boardsEl.appendChild(more)}else if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No installed boards match. Search Board Manager platforms below.';boardsEl.appendChild(empty)}platformsEl.replaceChildren(...platformSuggestions.map(platform=>{const row=document.createElement('div');row.className='platform';const info=document.createElement('div');sub(info,'primary',platform.name);sub(info,'secondary','Required platform is not installed. '+platform.id+(platform.maintainer?' · '+platform.maintainer:''));const install=document.createElement('button');install.className='install';install.textContent='Install';install.onclick=()=>{install.disabled=true;install.textContent='Installing…';vscode.postMessage({command:'installPlatform',platformId:platform.id,version:platform.version})};row.append(info,install);return row}));platformsEl.hidden=!platformSuggestions.length}
function renderPorts(){const needle=text(portSearch.value),filtered=data.ports.filter(port=>!needle||text([port.address,port.label,port.protocol,...(port.boards||[]).map(board=>board.name)].join(' ')).includes(needle));portsEl.replaceChildren(buttonRow('No port','Verify only',!selectedPort,()=>{selectedPort='';render()}),...filtered.map(port=>buttonRow(port.address,(port.boards||[]).map(board=>board.name).join(', ')||port.protocol||'Unknown device',port.address===selectedPort,()=>{selectedPort=port.address;render()})))}
function renderConnected(){connectedEl.replaceChildren();const connected=[];for(const port of data.connected){if(port.boards?.length){for(const board of port.boards)connected.push({board,port})}else connected.push({board:null,port})}if(!connected.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=data.loadingPorts?'Detecting serial ports…':'No connected boards';connectedEl.appendChild(empty);return}for(const item of connected){const button=document.createElement('button');button.className='device';button.type='button';const dot=document.createElement('span');dot.className='dot';button.appendChild(dot);const label=document.createElement('span');sub(label,'primary',item.board?.name||'Unknown Board');sub(label,'secondary',item.port.address+' · '+(item.port.protocol||'Unknown device'));button.appendChild(label);button.onclick=()=>{if(item.board){vscode.postMessage({command:'connected',boardFqbn:item.board.fqbn,boardName:item.board.name,portAddress:item.port.address})}else{selectedPort=item.port.address;portSearch.value=item.port.address;render();boardSearch.focus()}};connectedEl.appendChild(button)}}
function render(){renderBoards();renderPorts();renderConnected();const board=data.boards.find(item=>item.fqbn===selectedBoard),port=data.ports.find(item=>item.address===selectedPort);summary.replaceChildren();if(board){sub(summary,'primary',board.name);sub(summary,'secondary',board.fqbn+(board.platform?.name?' · '+board.platform.name:''))}else sub(summary,'error',data.loadingBoards?'Scanning boards…':'Select a board to continue.');if(port)sub(summary,'secondary',port.address+' · '+(port.protocol||'Unknown device'));ok.disabled=!selectedBoard}
function apply(){if(!selectedBoard)return;vscode.postMessage({command:'apply',boardFqbn:selectedBoard,boardName:selectedBoardName,portAddress:selectedPort})}function move(container,direction){const rows=[...container.querySelectorAll('.row')];if(!rows.length)return;const current=document.activeElement;const index=Math.max(0,rows.indexOf(current));rows[Math.min(rows.length-1,Math.max(0,index+direction))].focus()}
boardSearch.oninput=()=>{renderBoards();clearTimeout(platformTimer);platformSuggestions=[];platformsEl.hidden=true;const query=boardSearch.value.trim();if(query.length>=2)platformTimer=setTimeout(()=>vscode.postMessage({command:'searchPlatforms',query}),350)};portSearch.oninput=renderPorts;boardSearch.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();boardsEl.querySelector('.row')?.focus()}else if(event.key==='Enter'&&boardsEl.querySelectorAll('.row').length===1){boardsEl.querySelector('.row').click()}};portsEl.onkeydown=event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(portsEl,event.key==='ArrowDown'?1:-1)}};boardsEl.onkeydown=event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(boardsEl,event.key==='ArrowDown'?1:-1)}else if(event.key==='Enter'){event.preventDefault();document.activeElement.click()}};document.addEventListener('keydown',event=>{if(event.key==='Escape')vscode.postMessage({command:'cancel'});if(event.key==='Enter'&&selectedBoard&&document.activeElement.tagName!=='BUTTON')apply();if(event.ctrlKey&&event.key.toLowerCase()==='f'){event.preventDefault();boardSearch.focus()}});ok.onclick=apply;document.getElementById('refresh').onclick=()=>vscode.postMessage({command:'refresh'});document.getElementById('manager').onclick=()=>vscode.postMessage({command:'boardManager'});document.getElementById('cancel').onclick=document.getElementById('close').onclick=()=>vscode.postMessage({command:'cancel'});window.addEventListener('message',event=>{const msg=event.data;if(msg.command==='state'){data=msg;selectedBoard=selectedBoard||msg.selectedFqbn;selectedPort=selectedPort||msg.selectedPort;render()}else if(msg.command==='platformResults'&&msg.query===boardSearch.value.trim()){platformSuggestions=msg.platforms||[];renderBoards()}else if(msg.command==='platformInstalled'){platformSuggestions=platformSuggestions.filter(item=>item.id!==msg.platformId);renderBoards()}else if(msg.command==='error'){summary.className='summary error';summary.textContent=msg.message}});vscode.postMessage({command:'ready'});
</script></body></html>`;
	}
}
