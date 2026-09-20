/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as vscode from 'vscode';

export interface ISerialMonitorPort {
	readonly address: string;
	readonly label: string;
}

interface ISerialMonitorOptions {
	readonly executable: string;
	readonly ports: readonly ISerialMonitorPort[];
	readonly selectedPort?: string;
	readonly fqbn?: string;
	readonly refreshPorts: () => Promise<readonly ISerialMonitorPort[]>;
}

interface IWebviewMessage {
	readonly type: 'ready' | 'refreshPorts' | 'additional' | 'start' | 'stop' | 'send' | 'timestamp';
	readonly port?: string;
	readonly baudRate?: string;
	readonly lineEnding?: string;
	readonly text?: string;
	readonly bits?: string;
	readonly stopBits?: string;
	readonly parity?: string;
	readonly dtr?: string;
	readonly rts?: string;
	readonly echo?: boolean;
	readonly enabled?: boolean;
}

interface IConnectionSettings {
	readonly port: string;
	readonly baudRate: string;
	readonly bits: string;
	readonly stopBits: string;
	readonly parity: string;
	readonly dtr: string;
	readonly rts: string;
}

export class SerialMonitorPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private child: ChildProcessWithoutNullStreams | undefined;
	private closed: Promise<void> = Promise.resolve();
	private options: ISerialMonitorOptions | undefined;
	private activePort: string | undefined;
	private timestamp = 'None';
	private lastConnection: IConnectionSettings | undefined;
	private readonly additionalMonitors = new Set<SerialMonitorPanel>();

	get isRunning(): boolean {
		return Boolean(this.child) || [...this.additionalMonitors].some(monitor => monitor.isRunning);
	}

	async show(options: ISerialMonitorOptions): Promise<void> {
		this.options = options;
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Active);
			await this.postPorts(options.ports, options.selectedPort);
			return;
		}
		const panel = vscode.window.createWebviewPanel('redbrickArduino.serialMonitor', vscode.l10n.t('Arduino Serial Monitor'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
		this.panel = panel;
		panel.webview.html = this.html(panel.webview);
		panel.webview.onDidReceiveMessage((message: IWebviewMessage) => void this.handleMessage(message));
		panel.onDidDispose(() => {
			if (this.panel === panel) {
				this.panel = undefined;
				this.options = undefined;
			}
			void this.close();
		});
	}

	async close(): Promise<void> {
		await this.stopCurrent();
		await Promise.all([...this.additionalMonitors].map(monitor => monitor.close()));
	}

	private async stopCurrent(): Promise<void> {
		const child = this.child;
		if (child) {
			await this.stopProcessTree(child);
		}
		await this.closed;
		this.activePort = undefined;
		await this.post({ type: 'stopped' });
	}

	async resume(): Promise<void> {
		if (this.panel && this.lastConnection && !this.child) {
			await this.start(this.lastConnection);
		}
		await Promise.all([...this.additionalMonitors].map(monitor => monitor.resume()));
	}

	async changeTimestamp(): Promise<void> {
		const selected = await vscode.window.showQuickPick(['None', 'Time', 'ISO 8601'], { placeHolder: vscode.l10n.t('Serial Monitor Timestamp Format') });
		if (selected) {
			this.timestamp = selected;
		}
	}

	private async handleMessage(message: IWebviewMessage): Promise<void> {
		try {
			if (message.type === 'ready' && this.options) {
				await this.postPorts(this.options.ports, this.options.selectedPort);
			} else if (message.type === 'refreshPorts') {
				await this.postPorts(await this.options?.refreshPorts() ?? [], this.activePort ?? this.options?.selectedPort);
			} else if (message.type === 'additional' && this.options) {
				const monitor = new SerialMonitorPanel();
				this.additionalMonitors.add(monitor);
				await monitor.show({ ...this.options, selectedPort: this.activePort ?? this.options.selectedPort });
			} else if (message.type === 'start' && message.port && message.baudRate) {
				await this.start({
					port: message.port,
					baudRate: message.baudRate,
					bits: message.bits ?? '8',
					stopBits: message.stopBits ?? '1',
					parity: message.parity ?? 'none',
					dtr: message.dtr ?? 'on',
					rts: message.rts ?? 'on'
				});
			} else if (message.type === 'stop') {
				await this.close();
			} else if (message.type === 'send') {
				this.send(message.text ?? '', message.lineEnding ?? 'none', message.echo ?? false);
			} else if (message.type === 'timestamp') {
				this.timestamp = message.enabled ? 'ISO 8601' : 'None';
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			await this.post({ type: 'error', message: vscode.l10n.t('Serial Monitor: {0}', detail) });
		}
	}

	private async start(settings: IConnectionSettings): Promise<void> {
		if (!this.options) {
			return;
		}
		await this.stopCurrent();
		this.lastConnection = settings;
		this.activePort = settings.port;
		await this.post({ type: 'starting', port: settings.port, baudRate: settings.baudRate });
		const configuration = [`baudrate=${settings.baudRate}`, `bits=${settings.bits}`, `stop_bits=${settings.stopBits}`, `parity=${settings.parity}`, `dtr=${settings.dtr}`, `rts=${settings.rts}`].join(',');
		const args = ['monitor', '--port', settings.port, '--config', configuration, '--quiet'];
		if (this.options.fqbn) {
			args.push('--fqbn', this.options.fqbn);
		}
		const child = spawn(this.options.executable, args, { shell: false, windowsHide: true });
		this.child = child;
		this.closed = new Promise(resolve => child.once('close', code => {
			if (this.child === child) {
				this.child = undefined;
				this.activePort = undefined;
				void this.post({ type: 'stopped', code });
			}
			resolve();
		}));
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (text: string) => void this.postOutput(text));
		child.stderr.on('data', (text: string) => void this.post({ type: 'output', text, error: true }));
		await new Promise<void>((resolve, reject) => {
			child.once('spawn', () => {
				void this.post({ type: 'started', port: settings.port, baudRate: settings.baudRate });
				resolve();
			});
			child.once('error', reject);
		});
	}

	private send(text: string, lineEnding: string, echo: boolean): void {
		if (!this.child) {
			void this.post({ type: 'error', message: vscode.l10n.t('Start monitoring before sending serial data.') });
			return;
		}
		const endings: Record<string, string> = { none: '', lf: '\n', cr: '\r', crlf: '\r\n' };
		this.child.stdin.write(text + (endings[lineEnding] ?? ''));
		if (echo) {
			void this.postOutput(`> ${text}\n`);
		}
	}

	private async postOutput(text: string): Promise<void> {
		if (this.timestamp === 'None') {
			await this.post({ type: 'output', text });
			return;
		}
		const now = new Date();
		const prefix = `[${this.timestamp === 'Time' ? now.toLocaleTimeString() : now.toISOString()}] `;
		await this.post({ type: 'output', text: text.split(/(?<=\n)/).map(line => line ? prefix + line : '').join('') });
	}

	private async postPorts(ports: readonly ISerialMonitorPort[], selectedPort?: string): Promise<void> {
		await this.post({ type: 'ports', ports, selectedPort });
	}

	private async post(message: object): Promise<void> {
		await this.panel?.webview.postMessage(message);
	}

	private async stopProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
		if (process.platform !== 'win32' || !child.pid) {
			child.kill();
			return;
		}
		await new Promise<void>(resolve => {
			const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true });
			taskkill.once('error', () => {
				child.kill();
				resolve();
			});
			taskkill.once('close', () => resolve());
		});
	}

	private html(webview: vscode.Webview): string {
		const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
		const baudRates = ['300', '1200', '2400', '4800', '9600', '19200', '38400', '57600', '74880', '115200', '230400', '250000', '460800', '921600'];
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;padding:12px 18px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}.additional{display:block;margin-bottom:10px;color:var(--vscode-textLink-foreground);background:transparent;border:0;padding:0}.toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:10px;padding-bottom:10px}.subtoolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-top:1px solid var(--vscode-panel-border);border-bottom:1px solid var(--vscode-panel-border)}.field{display:grid;gap:4px;min-width:120px}.port{flex:1;min-width:280px}label,summary{color:var(--vscode-descriptionForeground);font-size:12px}select,input,button{height:28px;border:1px solid var(--vscode-dropdown-border);color:var(--vscode-input-foreground);background:var(--vscode-input-background);font:inherit}select,input{padding:0 8px}button{padding:0 10px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border-color:transparent}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary,button.toggle{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button.toggle.active{outline:1px solid var(--vscode-focusBorder);color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button:disabled,select:disabled,input:disabled{opacity:.55;cursor:default}.status{min-height:32px;display:flex;align-items:center;color:var(--vscode-descriptionForeground)}.running{color:var(--vscode-testing-iconPassed)}.error{color:var(--vscode-errorForeground)}details{margin-left:auto}details>div{position:absolute;right:18px;z-index:3;display:flex;gap:10px;padding:12px;border:1px solid var(--vscode-widget-border);background:var(--vscode-editorWidget-background);box-shadow:0 2px 8px var(--vscode-widget-shadow)}.terminal{height:calc(100vh - 235px);min-height:250px;overflow:auto;padding:12px;margin:0 0 10px;border:1px solid var(--vscode-panel-border);background:var(--vscode-terminal-background,var(--vscode-editor-background));color:var(--vscode-terminal-foreground,var(--vscode-editor-foreground));font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);white-space:pre-wrap;overflow-wrap:anywhere}.send{display:flex;gap:8px}.send input{flex:1}.errorText{color:var(--vscode-errorForeground)}
</style></head><body>
<button id="additional" class="additional">＋ Open an Additional Monitor</button>
<div class="toolbar">
	<div class="field"><label for="mode">Monitor Mode</label><select id="mode"><option>Serial</option></select></div>
	<div class="field"><label for="view">View Mode</label><select id="view"><option value="text">Text</option><option value="hex">Hex</option><option value="binary">Binary</option></select></div>
	<div class="field port"><label for="port">Port</label><select id="port"><option value="">No Serial Ports Detected</option></select></div>
	<div class="field"><label for="baud">Baud Rate</label><select id="baud">${baudRates.map(rate => `<option${rate === '115200' ? ' selected' : ''}>${rate}</option>`).join('')}</select></div>
	<div class="field"><label for="ending">Line Ending</label><select id="ending"><option value="none">None</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option></select></div>
</div>
<div class="subtoolbar">
	<button id="start">▶ Start Monitoring</button><button id="refresh" class="secondary" title="Refresh Ports">↻</button><button id="clear" class="secondary" title="Clear Output">Clear</button><button id="autoscroll" class="toggle active" title="Autoscroll">Autoscroll</button><button id="timestamp" class="toggle" title="Timestamp">Timestamp</button><button id="echo" class="toggle" title="Message Echoing">Echo</button><button id="reconnect" class="toggle" title="Automatic Reconnection">Reconnect</button>
	<details><summary>Additional Settings</summary><div><label>Data Bits <select id="bits"><option>5</option><option>6</option><option>7</option><option selected>8</option><option>9</option></select></label><label>Stop Bits <select id="stopBits"><option selected>1</option><option>1.5</option><option>2</option></select></label><label>Parity <select id="parity"><option value="none">None</option><option value="odd">Odd</option><option value="even">Even</option><option value="mark">Mark</option><option value="space">Space</option></select></label><label><input id="dtr" type="checkbox" checked> DTR</label><label><input id="rts" type="checkbox" checked> RTS</label></div></details>
</div>
<div id="status" class="status">Select a serial port and start monitoring.</div><pre id="terminal" class="terminal" aria-live="polite"></pre><form id="send" class="send"><input id="message" aria-label="Message" placeholder="Message to send to the board…" autocomplete="off"><button type="submit">Send</button></form><script nonce="${nonce}">
const vscode=acquireVsCodeApi(),byId=id=>document.getElementById(id),port=byId('port'),baud=byId('baud'),ending=byId('ending'),view=byId('view'),bits=byId('bits'),stopBits=byId('stopBits'),parity=byId('parity'),dtr=byId('dtr'),rts=byId('rts'),start=byId('start'),status=byId('status'),terminal=byId('terminal'),send=byId('send'),message=byId('message');let running=false;const toggles={autoscroll:true,timestamp:false,echo:false,reconnect:false};const toggle=id=>{toggles[id]=!toggles[id];byId(id).classList.toggle('active',toggles[id]);if(id==='timestamp')vscode.postMessage({type:'timestamp',enabled:toggles[id]})};['autoscroll','timestamp','echo','reconnect'].forEach(id=>byId(id).addEventListener('click',()=>toggle(id)));const setRunning=value=>{running=value;start.textContent=value?'■ Stop Monitoring':'▶ Start Monitoring';[port,baud,bits,stopBits,parity,dtr,rts].forEach(control=>control.disabled=value);message.disabled=!value;send.querySelector('button').disabled=!value},setStatus=(text,kind='')=>{status.textContent=text;status.className='status '+kind},startMonitor=()=>{if(!port.value){setStatus('Select an available serial port first.','error');return}vscode.postMessage({type:'start',port:port.value,baudRate:baud.value,bits:bits.value,stopBits:stopBits.value,parity:parity.value,dtr:dtr.checked?'on':'off',rts:rts.checked?'on':'off'})};start.addEventListener('click',()=>running?vscode.postMessage({type:'stop'}):startMonitor());byId('additional').addEventListener('click',()=>vscode.postMessage({type:'additional'}));byId('refresh').addEventListener('click',()=>vscode.postMessage({type:'refreshPorts'}));byId('clear').addEventListener('click',()=>terminal.textContent='');send.addEventListener('submit',event=>{event.preventDefault();if(!message.value)return;vscode.postMessage({type:'send',text:message.value,lineEnding:ending.value,echo:toggles.echo});message.value=''});const display=text=>{if(view.value==='text')return text;const bytes=new TextEncoder().encode(text);return [...bytes].map(byte=>view.value==='hex'?byte.toString(16).padStart(2,'0'):byte.toString(2).padStart(8,'0')).join(' ')+' '};window.addEventListener('message',event=>{const data=event.data;if(data.type==='ports'){const previous=data.selectedPort||port.value;port.replaceChildren(...data.ports.map(item=>{const option=document.createElement('option');option.value=item.address;option.textContent=item.label;return option}));if(!data.ports.length){const option=document.createElement('option');option.value='';option.textContent='No Serial Ports Detected';port.append(option)}if([...port.options].some(option=>option.value===previous))port.value=previous}else if(data.type==='starting'){setRunning(true);setStatus('Connecting to '+data.port+' at '+data.baudRate+' baud…')}else if(data.type==='started'){setRunning(true);setStatus('Monitoring '+data.port+' at '+data.baudRate+' baud','running')}else if(data.type==='stopped'){setRunning(false);setStatus(data.code&&data.code!==0?'Monitor stopped with exit code '+data.code+'.':'Monitoring stopped.');if(data.code&&toggles.reconnect)setTimeout(startMonitor,1000)}else if(data.type==='output'){const line=document.createElement('span');line.textContent=display(data.text);if(data.error)line.className='errorText';terminal.append(line);if(toggles.autoscroll)terminal.scrollTop=terminal.scrollHeight}else if(data.type==='error'){setRunning(false);setStatus(data.message,'error')}});setRunning(false);vscode.postMessage({type:'ready'});
</script></body></html>`;
	}

	dispose(): void {
		if (this.child) {
			void this.stopProcessTree(this.child);
		}
		this.panel?.dispose();
		for (const monitor of this.additionalMonitors) {
			monitor.dispose();
		}
		this.additionalMonitors.clear();
	}
}
