/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, join } from 'path';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { SerialMonitorPanel } from './serialMonitorPanel';
import { ensureProjectConfiguration } from './workspace/projectConfiguration';
import { ExampleDocuments } from './workspace/exampleDocuments';
import * as vscode from 'vscode';
import { ArduinoCli } from './cli/arduinoCli';
import { ArduinoManager } from './arduinoManager';
import { ArduinoState } from './arduinoState';
import { BoardSelector } from './boardSelector';
import { IArduinoBoard, IArduinoPort } from './arduinoTypes';
import { baseFqbn, composeFqbn, findBoardByFqbn, parseFqbnOptions } from './boardModel';
import { RaspberryPiConfigurationPanel } from './remote/raspberryPiConfigurationPanel';
import { RaspberryPiService } from './remote/raspberryPiService';
import { remoteUploadAdapterFor } from './remote/remoteUploadAdapter';
import { createArduinoProject, findSketchDirectory, initializeArduinoProject, openArduinoProject } from './workspace/arduinoWorkspace';

export class ArduinoController implements vscode.Disposable {
	private readonly output = vscode.window.createOutputChannel(vscode.l10n.t('Redbrick Arduino'));
	private readonly raspberryPi = new RaspberryPiService(this.output);
	private readonly cli = new ArduinoCli(this.output, this.raspberryPi);
	private readonly state = new ArduinoState(this.cli);
	private readonly selector = new BoardSelector(this.state);
	private readonly manager: ArduinoManager;
	private readonly raspberryPiPanel: RaspberryPiConfigurationPanel;
	private readonly monitor = new SerialMonitorPanel();
	private readonly exampleDocuments = new ExampleDocuments();
	private readonly boardStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
	private readonly portStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	private readonly readyStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
	private readonly uploadModeStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
	private configurationRefreshHandle: NodeJS.Timeout | undefined;
	private buildRunning = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.manager = new ArduinoManager(this.cli, this.state, () => this.selector.show());
		this.raspberryPiPanel = new RaspberryPiConfigurationPanel(this.raspberryPi, async () => this.scheduleStateRefresh());
		this.boardStatus.command = 'redbrickArduino.selectBoard';
		this.portStatus.command = 'redbrickArduino.selectPort';
		this.boardStatus.tooltip = vscode.l10n.t('Select the Arduino board');
		this.portStatus.tooltip = vscode.l10n.t('Select the serial port');
		this.readyStatus.tooltip = vscode.l10n.t('Arduino board and port readiness');
		this.uploadModeStatus.command = 'redbrickArduino.configureRaspberryPi';
		this.uploadModeStatus.tooltip = vscode.l10n.t('Configure Local or Raspberry Pi upload');
		this.context.subscriptions.push(this.state.onDidChange(() => this.updateStatusBar()));
		this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('redbrickArduino.upload.mode') || event.affectsConfiguration('redbrickArduino.remote')) { this.scheduleStateRefresh(); }
		}));
		this.updateStatusBar();
		this.boardStatus.show();
		this.portStatus.show();
		this.readyStatus.show();
		this.uploadModeStatus.show();
		void this.state.initialize().catch(error => void this.executeSafely(() => Promise.reject(error)));
	}

	registerCommands(): void {
		const commands: ReadonlyArray<readonly [string, () => Promise<void>]> = [
			['redbrickArduino.newProject', createArduinoProject],
			['redbrickArduino.initialize', initializeArduinoProject],
			['redbrickArduino.openProject', openArduinoProject],
			['redbrickArduino.configureRaspberryPi', async () => this.raspberryPiPanel.show()],
			['redbrickArduino.selectUploadMode', () => this.selectUploadMode()],
			['redbrickArduino.testRaspberryPi', () => this.testRaspberryPi()],
			['redbrickArduino.showCliVersion', () => this.showCliVersion()],
			['redbrickArduino.showBoardSelector', async () => this.selector.show()],
			['redbrickArduino.refreshPorts', () => this.state.refreshPorts()],
			['redbrickArduino.selectBoard', () => this.selectBoard()],
			['redbrickArduino.selectPort', () => this.selectPort()],
			['redbrickArduino.verify', () => this.verify()],
			['redbrickArduino.rebuildIntelliSense', () => this.rebuildIntelliSense()],
			['redbrickArduino.upload', () => this.uploadWithMonitorRestore(() => this.upload())],
			['redbrickArduino.cliUpload', () => this.uploadWithMonitorRestore(() => this.upload(false))],
			['redbrickArduino.uploadUsingProgrammer', () => this.uploadWithMonitorRestore(() => this.upload(true, true))],
			['redbrickArduino.cliUploadUsingProgrammer', () => this.uploadWithMonitorRestore(() => this.upload(false, true))],
			['redbrickArduino.closeSerialMonitor', () => this.monitor.close()],
			['redbrickArduino.changeTimestampFormat', () => this.monitor.changeTimestamp()],
			['redbrickArduino.updateIndexes', () => this.updateIndexes()],
			['redbrickArduino.addBoardManagerUrl', () => this.addBoardManagerUrl()],
			['redbrickArduino.installCore', () => this.installCore()],
			['redbrickArduino.installLibrary', () => this.installLibrary()],
			['redbrickArduino.boardConfiguration', async () => this.manager.showBoardConfiguration()],
			['redbrickArduino.openExample', () => this.openExample()],
			['redbrickArduino.serialMonitor', () => this.openSerialMonitor()],
			['redbrickArduino.showOutput', async () => this.output.show()]
		];
		for (const [command, handler] of commands) {
			const exclusive = ['redbrickArduino.verify', 'redbrickArduino.rebuildIntelliSense', 'redbrickArduino.upload', 'redbrickArduino.cliUpload', 'redbrickArduino.uploadUsingProgrammer', 'redbrickArduino.cliUploadUsingProgrammer', 'redbrickArduino.serialMonitor'].includes(command);
			this.context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
				if (exclusive && this.buildRunning) {
					await vscode.window.showInformationMessage(vscode.l10n.t('An Arduino operation is already running. Wait for it to finish or cancel it first.'));
					return;
				}
				if (exclusive) { this.buildRunning = true; }
				try { await this.executeSafely(handler); }
				finally { if (exclusive) { this.buildRunning = false; } }
			}));
		}
	}

	dispose(): void {
		if (this.configurationRefreshHandle) { clearTimeout(this.configurationRefreshHandle); }
		this.selector.dispose();
		this.state.dispose();
		this.exampleDocuments.dispose();
		this.manager.dispose();
		this.raspberryPiPanel.dispose();
		this.monitor.dispose();
		this.output.dispose();
		this.boardStatus.dispose();
		this.portStatus.dispose();
		this.readyStatus.dispose();
		this.uploadModeStatus.dispose();
	}

	private scheduleStateRefresh(): void {
		if (this.configurationRefreshHandle) { clearTimeout(this.configurationRefreshHandle); }
		this.configurationRefreshHandle = setTimeout(() => {
			this.configurationRefreshHandle = undefined;
			void this.state.initialize().catch(error => void this.executeSafely(() => Promise.reject(error)));
		}, 250);
	}

	private async executeSafely(handler: () => Promise<void>): Promise<void> {
		try {
			await handler();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.output.appendLine(message);
			const showOutput = vscode.l10n.t('Show Output');
			const configure = this.cli.isRemoteMode ? vscode.l10n.t('Configure Raspberry Pi') : vscode.l10n.t('Configure CLI Path');
			const selectPort = vscode.l10n.t('Select Port');
			const portBusy = /access is denied|permissionerror|port (?:is )?busy|could not open (?:the )?(?:serial )?port|resource busy/i.test(message);
			const piOffline = /connection timed out|connection refused|no route to host|could not resolve hostname|network is unreachable/i.test(message);
			const authentication = /permission denied \(publickey|host key verification failed|bad permissions.*private key/i.test(message);
			const boardMissing = /no device found|board not found|no such file or directory.*(?:tty|cu\.)/i.test(message);
			const missingCore = /platform.*not installed|core.*not installed|unknown fqbn|discovery.*not found/i.test(message);
			const displayMessage = portBusy
				? vscode.l10n.t('Serial port is busy. Close Serial Monitor and other tools using the port, then try again. Details: {0}', message)
				: piOffline ? vscode.l10n.t('Raspberry Pi is offline or unreachable. Check its IP address, Wi-Fi/LAN connection, and SSH service. Details: {0}', message)
					: authentication ? vscode.l10n.t('Raspberry Pi SSH key authentication failed. Check the username, private key, and authorized_keys on the Pi. Details: {0}', message)
						: boardMissing ? vscode.l10n.t('The USB board was not found on Raspberry Pi. Reconnect it, check the USB cable, and refresh ports. Details: {0}', message)
							: missingCore ? vscode.l10n.t('The selected board core is missing on Raspberry Pi. Open Board Manager in Raspberry Pi mode or run setup_pi.sh. Details: {0}', message)
								: vscode.l10n.t('Redbrick Arduino: {0}', message);
			const action = await vscode.window.showErrorMessage(displayMessage, showOutput, portBusy ? selectPort : configure);
			if (action === showOutput) {
				this.output.show();
			} else if (action === selectPort) {
				await this.selectPort();
			} else if (action === configure) {
				if (this.cli.isRemoteMode) { this.raspberryPiPanel.show(); }
				else { await vscode.commands.executeCommand('workbench.action.openSettings', 'redbrickArduino.cli.path'); }
			}
		}
	}

	private async showCliVersion(): Promise<void> {
		const result = await this.cli.run(['version']);
		await vscode.window.showInformationMessage(result.stdout.trim());
	}

	private async selectUploadMode(): Promise<void> {
		const selected = await vscode.window.showQuickPick([
			{ label: vscode.l10n.t('Local'), description: vscode.l10n.t('Use USB ports connected to this computer'), value: 'local' },
			{ label: vscode.l10n.t('Raspberry Pi'), description: vscode.l10n.t('Use Arduino CLI and USB ports on Raspberry Pi over SSH'), value: 'raspberryPi' }
		] as const, { placeHolder: vscode.l10n.t('Select Arduino upload mode') });
		if (!selected) { return; }
		await vscode.workspace.getConfiguration('redbrickArduino').update('upload.mode', selected.value, vscode.ConfigurationTarget.Global);
		if (selected.value === 'raspberryPi') { this.raspberryPiPanel.show(); }
	}

	private async testRaspberryPi(): Promise<void> {
		const details = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Testing Raspberry Pi connection…'), cancellable: true }, (_progress, token) => this.raspberryPi.testConnection(undefined, token));
		await vscode.window.showInformationMessage(vscode.l10n.t('Raspberry Pi connection succeeded: {0}', details.replace(/\s+/g, ' ')));
	}

	private async selectBoard(): Promise<void> {
		await this.state.refreshBoards(true);
		const snapshot = this.state.snapshot;
		const selected = await vscode.window.showQuickPick(snapshot.availableBoards.map(board => ({
			label: board.name,
			description: baseFqbn(board.fqbn),
			detail: [board.platform?.name, board.platform?.vendor, board.platform?.architecture].filter(Boolean).join(' · '),
			board
		})), {
			placeHolder: vscode.l10n.t('Select board type'),
			matchOnDescription: true,
			matchOnDetail: true
		});
		if (selected) { await this.state.setBoard(selected.board); }
	}

	private async selectPort(): Promise<void> {
		await this.state.refreshPorts();
		const snapshot = this.state.snapshot;
		const choices = [
			{ label: vscode.l10n.t('No port'), description: vscode.l10n.t('Verify only'), port: undefined },
			...snapshot.availablePorts.map(port => ({
				label: port.port.address,
				description: port.matching_boards?.map(board => board.name).join(', ') || port.port.protocol_label || port.port.label || vscode.l10n.t('Serial Port'),
				detail: [port.port.properties?.vid && `VID ${port.port.properties.vid}`, port.port.properties?.pid && `PID ${port.port.properties.pid}`].filter(Boolean).join(' · '),
				port
			}))
		];
		const selected = await vscode.window.showQuickPick(choices, {
			placeHolder: vscode.l10n.t('Select serial port'),
			matchOnDescription: true,
			matchOnDetail: true
		});
		if (selected) { await this.state.setPort(selected.port); }
	}

	private async verify(): Promise<void> {
		const sketch = await this.requireSketch();
		const board = await this.requireBoard();
		if (!sketch || !board) {
			return;
		}
		await ensureProjectConfiguration(vscode.Uri.file(sketch), board.fqbn);
		if (this.cli.isRemoteMode) {
			await this.verifyRemote(sketch, board);
			return;
		}
		await this.invalidateBuild(sketch);
		await this.runProgress(vscode.l10n.t('Verifying {0}…', basename(sketch)), ['compile', '--fqbn', board.fqbn, '--build-path', this.buildDirectory(sketch), sketch], sketch);
		await this.recordBuild(sketch, board.fqbn);
		void vscode.window.showInformationMessage(vscode.l10n.t('Arduino sketch verified successfully.'));
	}

	private async verifyRemote(sketch: string, board: IArduinoBoard): Promise<void> {
		const adapter = remoteUploadAdapterFor(board.fqbn);
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Verifying {0} on Raspberry Pi…', basename(sketch)), cancellable: true }, async (progress, token) => {
			const session = await this.raspberryPi.stageSketch(sketch, token, message => progress.report({ message }));
			try {
				this.output.appendLine(vscode.l10n.t('Remote adapter: {0} ({1})', adapter.family, adapter.openOcdReady ? 'Arduino CLI / OpenOCD-ready' : adapter.id));
				progress.report({ message: vscode.l10n.t('Compiling on Raspberry Pi…') });
				await this.cli.run(adapter.compileArgs(board.fqbn, session.buildPath, session.sketchPath), token);
			} finally {
				await session.cleanup();
			}
		});
		void vscode.window.showInformationMessage(vscode.l10n.t('Arduino sketch verified successfully on Raspberry Pi.'));
	}

	private async uploadWithMonitorRestore(upload: () => Promise<void>): Promise<void> {
		const restoreMonitor = this.monitor.isRunning;
		await this.monitor.close();
		try {
			await upload();
		} finally {
			if (restoreMonitor) {
				await this.monitor.resume();
			}
		}
	}

	private async upload(build = true, usingProgrammer = false): Promise<void> {
		const sketch = await this.requireSketch();
		const board = await this.requireBoard();
		const port = usingProgrammer ? this.state.snapshot.selectedPort : await this.requirePort();
		if (!sketch || !board || (!port && !usingProgrammer)) {
			return;
		}
		const buildPath = this.buildDirectory(sketch);
		const programmerArgs: string[] = [];
		if (usingProgrammer) {
			const details = await this.cli.runJson<{ programmers?: { id: string; name: string }[] }>(['board', 'details', '--fqbn', board.fqbn, '--format', 'json']);
			const programmer = await vscode.window.showQuickPick((details.programmers ?? []).map(item => ({ label: item.name, id: item.id })), { placeHolder: vscode.l10n.t('Select Programmer') });
			if (!programmer) { return; }
			programmerArgs.push('--programmer', programmer.id);
		}
		if (this.cli.isRemoteMode) {
			await this.uploadRemote(sketch, board, port, programmerArgs, build);
			return;
		}
		if (build) {
			await this.invalidateBuild(sketch);
			await this.runProgress(vscode.l10n.t('Compiling {0}…', basename(sketch)), ['compile', '--fqbn', board.fqbn, '--build-path', buildPath, sketch], sketch);
			await this.recordBuild(sketch, board.fqbn);
		} else {
			let previous: string | undefined;
			try { previous = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(join(buildPath, 'redbrick-fqbn.txt')))); } catch { /* No completed build. */ }
			if (previous !== board.fqbn) { throw new Error(vscode.l10n.t('Verify the sketch with the selected board settings before CLI Upload.')); }
		}
		try {
			await this.runProgress(vscode.l10n.t('Uploading sketch…'), ['upload', ...(port ? ['--port', port.port.address] : []), '--fqbn', board.fqbn, '--input-dir', buildPath, ...programmerArgs, sketch], sketch);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const connectionFailure = /failed to connect|no serial data received|wrong boot mode|timed out waiting for packet header|write timeout/i.test(message);
			if (usingProgrammer || !board.fqbn.startsWith('esp32:') || !connectionFailure) { throw error; }
			const retry = vscode.l10n.t('Retry at 115200');
			const action = await vscode.window.showWarningMessage(vscode.l10n.t('ESP32 did not enter upload mode. Hold the BOOT button, click Retry, and release BOOT when the upload starts.'), { modal: true }, retry);
			if (action !== retry) { throw error; }
			const safeBoard = { ...board, name: `${board.name} (115200 safe upload)`, fqbn: composeFqbn(board.fqbn, { ...parseFqbnOptions(board.fqbn), UploadSpeed: '115200' }) };
			await this.state.setBoardByFqbn(safeBoard.fqbn, safeBoard.name);
			await this.invalidateBuild(sketch);
			await this.runProgress(vscode.l10n.t('Compiling {0} with safe ESP32 settings…', basename(sketch)), ['compile', '--fqbn', safeBoard.fqbn, '--build-path', buildPath, sketch], sketch);
			await this.recordBuild(sketch, safeBoard.fqbn);
			await this.runProgress(vscode.l10n.t('Retrying ESP32 upload at 115200…'), ['upload', '--port', port?.port.address ?? '', '--fqbn', safeBoard.fqbn, '--input-dir', buildPath, sketch], sketch);
		}
		void vscode.window.showInformationMessage(vscode.l10n.t('Arduino sketch uploaded successfully.'));
	}

	private async uploadRemote(sketch: string, board: IArduinoBoard, port: IArduinoPort | undefined, programmerArgs: readonly string[], requestedBuild: boolean): Promise<void> {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Uploading {0} through Raspberry Pi…', basename(sketch)), cancellable: true }, async (progress, token) => {
			const session = await this.raspberryPi.stageSketch(sketch, token, message => progress.report({ message }));
			try {
				if (!requestedBuild) { this.output.appendLine(vscode.l10n.t('Remote CLI Upload compiles again because temporary Raspberry Pi build files are removed after every operation.')); }
				let uploadBoard = board;
				let adapter = remoteUploadAdapterFor(uploadBoard.fqbn);
				this.output.appendLine(vscode.l10n.t('Remote adapter: {0} ({1})', adapter.family, adapter.openOcdReady ? 'Arduino CLI / OpenOCD-ready' : adapter.id));
				progress.report({ message: vscode.l10n.t('Compiling on Raspberry Pi…') });
				await this.cli.run(adapter.compileArgs(uploadBoard.fqbn, session.buildPath, session.sketchPath), token);
				try {
					progress.report({ message: vscode.l10n.t('Uploading to {0} on Raspberry Pi…', port?.port.address ?? vscode.l10n.t('programmer')) });
					await this.cli.run(adapter.uploadArgs(uploadBoard.fqbn, session.buildPath, session.sketchPath, port?.port.address, programmerArgs), token);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					const connectionFailure = /failed to connect|no serial data received|wrong boot mode|timed out waiting for packet header|write timeout/i.test(message);
					if (programmerArgs.length || !uploadBoard.fqbn.startsWith('esp32:') || !connectionFailure) { throw error; }
					const retry = vscode.l10n.t('Retry at 115200');
					const action = await vscode.window.showWarningMessage(vscode.l10n.t('ESP32 on Raspberry Pi did not enter upload mode. Hold the BOOT button, click Retry, and release BOOT when upload starts.'), { modal: true }, retry);
					if (action !== retry) { throw error; }
					uploadBoard = { ...uploadBoard, name: `${uploadBoard.name} (115200 safe upload)`, fqbn: composeFqbn(uploadBoard.fqbn, { ...parseFqbnOptions(uploadBoard.fqbn), UploadSpeed: '115200' }) };
					adapter = remoteUploadAdapterFor(uploadBoard.fqbn);
					await this.state.setBoardByFqbn(uploadBoard.fqbn, uploadBoard.name);
					progress.report({ message: vscode.l10n.t('Recompiling ESP32 at safe upload speed…') });
					await this.cli.run(adapter.compileArgs(uploadBoard.fqbn, session.buildPath, session.sketchPath), token);
					await this.cli.run(adapter.uploadArgs(uploadBoard.fqbn, session.buildPath, session.sketchPath, port?.port.address, programmerArgs), token);
				}
			} finally {
				await session.cleanup();
			}
		});
		void vscode.window.showInformationMessage(vscode.l10n.t('Arduino sketch uploaded successfully through Raspberry Pi.'));
	}

	private async updateIndexes(): Promise<void> {
		await this.runProgress(vscode.l10n.t('Updating board package index…'), ['core', 'update-index']);
		await this.runProgress(vscode.l10n.t('Updating library index…'), ['lib', 'update-index']);
		await vscode.window.showInformationMessage(vscode.l10n.t('Arduino board and library indexes are up to date.'));
	}

	private async addBoardManagerUrl(): Promise<void> {
		const url = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Enter a board package index URL'),
			placeHolder: 'https://example.com/package_vendor_index.json',
			ignoreFocusOut: true,
			validateInput: value => {
				try {
					const uri = vscode.Uri.parse(value.trim(), true);
					return (uri.scheme === 'https' || uri.scheme === 'http') && uri.authority
						? undefined
						: vscode.l10n.t('Enter a valid HTTP or HTTPS URL.');
				} catch {
					return vscode.l10n.t('Enter a valid HTTP or HTTPS URL.');
				}
			}
		});
		if (!url) {
			return;
		}

		const normalizedUrl = url.trim();
		await this.runProgress(vscode.l10n.t('Adding Board Manager URL…'), ['config', 'add', 'board_manager.additional_urls', normalizedUrl]);
		await this.runProgress(vscode.l10n.t('Updating board package index…'), ['core', 'update-index']);
		await vscode.window.showInformationMessage(vscode.l10n.t('Board Manager URL added and package index updated.'));
	}

	private async installCore(): Promise<void> {
		this.manager.showBoardManager();
	}

	private async installLibrary(): Promise<void> {
		this.manager.showLibraryManager();
	}

	private async openExample(): Promise<void> {
		const board = await this.requireBoard();
		if (!board) { return; }
		const data = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Loading examples for {0}…', board.name), cancellable: true }, (_progress, token) =>
			this.cli.runJson<{ examples?: { library: { name: string }; examples?: string[] }[] }>(['lib', 'examples', '--fqbn', board.fqbn, '--json'], token));
		const examples = (data.examples ?? []).flatMap(entry => (entry.examples ?? []).map(example => ({
			label: basename(example),
			description: entry.library.name,
			detail: example,
			path: example
		})));
		const builtInRoot = vscode.Uri.file(join(dirname(this.cli.resolveExecutable()), 'Examples'));
		const collect = async (folder: vscode.Uri, category: string, depth: number): Promise<void> => {
			if (depth > 8) { return; }
			const entries = await vscode.workspace.fs.readDirectory(folder);
			if (entries.some(([name]) => name === `${basename(folder.fsPath)}.ino`)) {
				examples.push({ label: basename(folder.fsPath), description: category, detail: folder.fsPath, path: folder.fsPath });
				return;
			}
			for (const [name, type] of entries) {
				if (type === vscode.FileType.Directory) { await collect(vscode.Uri.joinPath(folder, name), category || `Built-in / ${name}`, depth + 1); }
			}
		};
		try { await collect(builtInRoot, '', 0); }
		catch (error) {
			if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') { throw error; }
		}
		if (!examples.length) {
			await vscode.window.showWarningMessage(vscode.l10n.t('No installed Arduino library examples were found.'));
			return;
		}
		const group = await vscode.window.showQuickPick([...new Set(examples.map(example => example.description))].sort(), { placeHolder: vscode.l10n.t('Built-in Examples and Examples for {0}', board.name) });
		if (!group) { return; }
		const selected = await vscode.window.showQuickPick(examples.filter(example => example.description === group), { matchOnDescription: true, matchOnDetail: true, placeHolder: vscode.l10n.t('Select an Arduino example') });
		if (selected) {
			await this.exampleDocuments.open(selected.path, board.fqbn);
		}
	}

	private async openSerialMonitor(): Promise<void> {
		if (this.cli.isRemoteMode) {
			await vscode.window.showInformationMessage(vscode.l10n.t('Remote Verify and Upload are enabled. Remote Serial Monitor is not enabled yet; use SSH or switch Upload Mode to Local.'));
			return;
		}
		await this.state.refreshPorts(true);
		const snapshot = this.state.snapshot;
		const monitorPorts = () => this.state.snapshot.availablePorts.map(item => ({
			address: item.port.address,
			label: [item.port.address, item.matching_boards?.map(board => board.name).join(', ') || item.port.protocol_label || item.port.label].filter(Boolean).join(' — ')
		}));
		await this.monitor.show({
			executable: this.cli.resolveExecutable(),
			ports: monitorPorts(),
			selectedPort: snapshot.selectedPort?.port.address,
			fqbn: snapshot.selectedFqbn,
			refreshPorts: async () => {
				await this.state.refreshPorts(true);
				return monitorPorts();
			}
		});
	}

	private async runProgress(title: string, args: readonly string[], cwd?: string): Promise<void> {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (_progress, token) => {
			await this.cli.run(args, token, cwd);
		});
	}

	private async requireSketch(): Promise<string | undefined> {
		const active = vscode.window.activeTextEditor?.document;
		if (active?.uri.scheme === 'redbrick-example') { return this.exampleDocuments.saveForBuild(active); }
		if (!await vscode.workspace.saveAll(false)) { return undefined; }
		return findSketchDirectory();
	}

	private async invalidateBuild(sketch: string): Promise<void> {
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(this.buildDirectory(sketch)));
		await this.recordBuild(sketch, '');
	}

	private async recordBuild(sketch: string, fqbn: string): Promise<void> {
		await vscode.workspace.fs.writeFile(vscode.Uri.file(join(this.buildDirectory(sketch), 'redbrick-fqbn.txt')), new TextEncoder().encode(fqbn));
	}

	private buildDirectory(sketch: string): string {
		return join(tmpdir(), 'redbrick-arduino-build', createHash('sha256').update(sketch).digest('hex').slice(0, 24));
	}

	private async rebuildIntelliSense(): Promise<void> {
		const sketch = await this.requireSketch();
		const board = await this.requireBoard();
		if (!sketch || !board) { return; }
		const buildPath = this.buildDirectory(sketch) + '-intellisense';
		const database = vscode.Uri.file(join(sketch, 'compile_commands.json'));
		let exists = false;
		try { await vscode.workspace.fs.stat(database); exists = true; }
		catch (error) {
			if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') { throw error; }
		}
		if (exists && await vscode.window.showWarningMessage(vscode.l10n.t('Replace the existing compile_commands.json with Arduino compiler settings?'), { modal: true }, vscode.l10n.t('Replace')) !== vscode.l10n.t('Replace')) { return; }
		await this.runProgress(vscode.l10n.t('Generating Arduino IntelliSense Configuration…'), ['compile', '--fqbn', board.fqbn, '--build-path', buildPath, '--only-compilation-database', sketch], sketch);
		await vscode.workspace.fs.copy(vscode.Uri.file(join(buildPath, 'compile_commands.json')), database, { overwrite: true });
		if (vscode.extensions.getExtension('ms-vscode.cpptools')) {
			await vscode.workspace.getConfiguration('C_Cpp', database).update('default.compileCommands', database.fsPath, vscode.ConfigurationTarget.WorkspaceFolder);
		}
		void vscode.window.showInformationMessage(vscode.l10n.t('Generated compile_commands.json for clangd and C/C++ IntelliSense.'));
	}

	private async requireBoard(): Promise<IArduinoBoard | undefined> {
		const snapshot = this.state.snapshot;
		if (snapshot.selectedBoard && snapshot.selectedFqbn) {
			if (!findBoardByFqbn(snapshot.availableBoards, snapshot.selectedFqbn)) {
				const action = await vscode.window.showWarningMessage(vscode.l10n.t('Required board platform is not installed.'), vscode.l10n.t('Open Board Manager'));
				if (action) { this.manager.showBoardManager(); }
				return undefined;
			}
			return { ...snapshot.selectedBoard, fqbn: snapshot.selectedFqbn };
		}
		const action = await vscode.window.showWarningMessage(vscode.l10n.t('No board selected. Select a board before verifying or uploading the sketch.'), vscode.l10n.t('Select Board'));
		if (action) { this.selector.show(); }
		return undefined;
	}

	private async requirePort(): Promise<IArduinoPort | undefined> {
		await this.state.refreshPorts(true);
		const port = this.state.snapshot.selectedPort;
		if (port) { return port; }
		const action = await vscode.window.showWarningMessage(vscode.l10n.t('No serial port selected. Select a connected serial port to continue.'), vscode.l10n.t('Select Port'));
		if (!action) { return undefined; }
		await this.selectPort();
		return this.state.snapshot.selectedPort;
	}

	private updateStatusBar(): void {
		const snapshot = this.state.snapshot;
		this.boardStatus.text = snapshot.selectedBoard ? `$(circuit-board) ${snapshot.selectedBoard.name}` : `$(circuit-board) ${vscode.l10n.t('Select Board')}`;
		this.portStatus.text = snapshot.selectedPort ? `$(plug) ${snapshot.selectedPort.port.address}` : snapshot.unavailablePort ? `$(warning) ${snapshot.unavailablePort} unavailable` : `$(plug) ${vscode.l10n.t('No Port')}`;
		this.readyStatus.text = snapshot.selectedBoard && snapshot.selectedPort ? `$(pass-filled) ${vscode.l10n.t('Ready')}` : snapshot.loadingPorts ? `$(sync~spin) ${vscode.l10n.t('Detecting ports')}` : `$(circle-slash) ${vscode.l10n.t('Not Ready')}`;
		this.uploadModeStatus.text = snapshot.uploadMode === 'raspberryPi' ? `$(remote) ${vscode.l10n.t('Raspberry Pi')}` : `$(device-desktop) ${vscode.l10n.t('Local')}`;
	}
}
