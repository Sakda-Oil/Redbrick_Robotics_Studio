/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ArduinoCli } from './cli/arduinoCli';
import { baseFqbn, composeFqbn, findBoardByFqbn, optionDefaults, parseFqbnOptions } from './boardModel';
import { IArduinoBoard, IArduinoBoardDetails, IArduinoBoardOption, IArduinoPlatformSuggestion, IArduinoPort, IArduinoProjectConfiguration, IArduinoStateSnapshot } from './arduinoTypes';

interface IBoardList { readonly boards?: readonly IArduinoBoard[] }
interface IPortList { readonly detected_ports?: readonly IArduinoPort[] }
interface IPlatformSearchResult {
	readonly platforms?: readonly {
		readonly id: string;
		readonly maintainer?: string;
		readonly installed_version?: string;
		readonly latest_version?: string;
		readonly releases?: Readonly<Record<string, { readonly name?: string; readonly boards?: readonly { readonly name: string }[] }>>;
	}[];
}

export class ArduinoState implements vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<IArduinoStateSnapshot>();
	readonly onDidChange = this.changeEmitter.event;
	private readonly disposables: vscode.Disposable[] = [];
	private pollHandle: NodeJS.Timeout | undefined;
	private board: IArduinoBoard | undefined;
	private port: IArduinoPort | undefined;
	private missingPort: string | undefined;
	private boards: readonly IArduinoBoard[] = [];
	private ports: readonly IArduinoPort[] = [];
	private options: readonly IArduinoBoardOption[] = [];
	private optionValues: Record<string, string> = {};
	private boardsLoading = false;
	private portsLoading = false;
	private detailsLoading = false;
	private lastError: string | undefined;
	private refreshingPorts: Promise<void> | undefined;

	constructor(private readonly cli: ArduinoCli) {
		this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => void this.initialize()));
		this.disposables.push(vscode.window.onDidChangeWindowState(event => { if (event.focused) { void this.refreshPorts(true); } }));
	}

	get snapshot(): IArduinoStateSnapshot {
		return {
			uploadMode: this.cli.uploadMode,
			selectedBoard: this.board,
			selectedFqbn: this.board ? composeFqbn(this.board.fqbn, this.optionValues) : undefined,
			selectedPort: this.port,
			unavailablePort: this.missingPort,
			availableBoards: this.boards,
			availablePorts: this.ports,
			boardOptions: this.options,
			boardOptionValues: { ...this.optionValues },
			loadingBoards: this.boardsLoading,
			loadingPorts: this.portsLoading,
			loadingBoardDetails: this.detailsLoading,
			error: this.lastError
		};
	}

	async initialize(): Promise<void> {
		await this.restoreProject();
		await Promise.all([this.refreshBoards(true), this.refreshPorts(true)]);
		if (this.board) { await this.loadBoardDetails(this.board, this.optionValues, true); }
		if (!this.pollHandle) {
			this.pollHandle = setInterval(() => void this.refreshPorts(true), 15000);
		}
	}

	dispose(): void {
		if (this.pollHandle) { clearInterval(this.pollHandle); }
		this.changeEmitter.dispose();
		for (const disposable of this.disposables) { disposable.dispose(); }
	}

	async refreshBoards(silent = false): Promise<void> {
		this.boardsLoading = true;
		this.emit();
		try {
			const result = await this.cli.runJson<IBoardList>(['board', 'listall', '--format', 'json']);
			this.boards = [...(result.boards ?? [])].sort((left, right) => left.name.localeCompare(right.name));
			if (this.board) {
				const installed = findBoardByFqbn(this.boards, this.board.fqbn);
				if (installed) { this.board = { ...installed, name: installed.name }; }
			}
			this.lastError = undefined;
		} catch (error) {
			this.lastError = this.message(error);
			if (!silent) { throw error; }
		} finally {
			this.boardsLoading = false;
			this.emit();
		}
	}

	async refreshPorts(silent = false): Promise<void> {
		if (this.refreshingPorts) { return this.refreshingPorts; }
		this.refreshingPorts = this.doRefreshPorts(silent).finally(() => this.refreshingPorts = undefined);
		return this.refreshingPorts;
	}

	private async doRefreshPorts(silent: boolean): Promise<void> {
		if (!silent) {
			this.portsLoading = true;
			this.emit();
		}
		try {
			const result = await this.cli.runJson<IPortList>(['board', 'list', '--format', 'json']);
			this.ports = [...(result.detected_ports ?? [])].sort((left, right) => left.port.address.localeCompare(right.port.address, undefined, { numeric: true }));
			if (this.port || this.missingPort) {
				const address = this.port?.port.address ?? this.missingPort;
				const current = this.ports.find(candidate => candidate.port.address === address);
				this.port = current;
				this.missingPort = current ? undefined : address;
			}
			this.lastError = undefined;
		} catch (error) {
			this.lastError = this.message(error);
			if (!silent) { throw error; }
		} finally {
			if (!silent) { this.portsLoading = false; }
			this.emit();
		}
	}

	async setBoard(board: IArduinoBoard, requestedOptions: Readonly<Record<string, string>> = {}): Promise<void> {
		await this.loadBoardDetails({ ...board, fqbn: baseFqbn(board.fqbn) }, { ...parseFqbnOptions(board.fqbn), ...requestedOptions }, true);
	}

	async setBoardByFqbn(fqbn: string, name?: string): Promise<void> {
		const base = baseFqbn(fqbn);
		const board = findBoardByFqbn(this.boards, base) ?? { name: name || base, fqbn: base };
		await this.setBoard(board, parseFqbnOptions(fqbn));
	}

	async setPort(port: IArduinoPort | undefined): Promise<void> {
		this.port = port;
		this.missingPort = undefined;
		await this.persistProject();
		this.emit();
	}

	async setBoardOption(option: string, value: string): Promise<void> {
		const definition = this.options.find(candidate => candidate.option === option);
		if (!definition?.values.some(candidate => candidate.value === value)) { throw new Error(vscode.l10n.t('Invalid board option {0}={1}.', option, value)); }
		this.optionValues = { ...this.optionValues, [option]: value };
		await this.persistProject();
		this.emit();
	}

	async resetBoardOptions(): Promise<void> {
		this.optionValues = optionDefaults(this.options);
		await this.persistProject();
		this.emit();
	}

	async searchUninstalledPlatforms(query: string): Promise<readonly IArduinoPlatformSuggestion[]> {
		const normalized = query.trim();
		if (normalized.length < 2) { return []; }
		const result = await this.cli.runJson<IPlatformSearchResult>(['core', 'search', normalized, '--format', 'json']);
		return (result.platforms ?? []).filter(platform => !platform.installed_version).slice(0, 20).map(platform => {
			const versions = Object.keys(platform.releases ?? {}).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
			const version = platform.latest_version || versions[0] || '';
			const release = version ? platform.releases?.[version] : undefined;
			return { id: platform.id, name: release?.name || platform.id, maintainer: platform.maintainer || '', version, boards: (release?.boards ?? []).map(board => board.name) };
		});
	}

	async installPlatform(id: string, version?: string): Promise<void> {
		const target = version ? `${id}@${version}` : id;
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Installing board platform {0}…', target), cancellable: true }, async (_progress, token) => {
			await this.cli.run(['core', 'install', target], token);
		});
		await this.refreshBoards();
	}

	private async loadBoardDetails(board: IArduinoBoard, requested: Readonly<Record<string, string>>, persist: boolean): Promise<void> {
		this.detailsLoading = true;
		this.emit();
		try {
			const details = await this.cli.runJson<IArduinoBoardDetails>(['board', 'details', '--fqbn', baseFqbn(board.fqbn), '--format', 'json']);
			this.options = details.config_options ?? [];
			const defaults = optionDefaults(this.options);
			const valid = Object.fromEntries(Object.entries(requested).filter(([key, value]) => this.options.some(option => option.option === key && option.values.some(candidate => candidate.value === value))));
			this.optionValues = { ...defaults, ...valid };
			this.board = {
				...board,
				name: details.name || board.name,
				fqbn: baseFqbn(board.fqbn),
				platform: {
					...board.platform,
					name: details.platform?.name || board.platform?.name,
					vendor: details.package?.maintainer || board.platform?.vendor,
					architecture: details.platform?.architecture || board.platform?.architecture
				}
			};
			this.lastError = undefined;
			if (persist) { await this.persistProject(); }
		} finally {
			this.detailsLoading = false;
			this.emit();
		}
	}

	private async restoreProject(): Promise<void> {
		const folder = this.projectFolder();
		if (!folder) { return; }
		this.board = undefined;
		this.port = undefined;
		this.missingPort = undefined;
		this.options = [];
		this.optionValues = {};
		let config: IArduinoProjectConfiguration | undefined;
		try {
			const vscodeConfig = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, '.vscode', 'arduino.json')))) as { board?: string; port?: string; configuration?: string };
			config = {
				...(vscodeConfig.board ? { board: { name: vscodeConfig.board, fqbn: vscodeConfig.board } } : {}),
				...(vscodeConfig.port ? { port: vscodeConfig.port } : {}),
				options: Object.fromEntries((vscodeConfig.configuration || '').split(',').filter(Boolean).map(entry => entry.split('=', 2)))
			};
		} catch { /* The folder has not been initialized yet. */ }
		if (!config?.board) {
			try {
				// One-time compatibility with Redbrick 0.5.0 projects. New writes
				// use .vscode/arduino.json, matching vscode-arduino.
				config = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, '.redbrick', 'arduino.json')))) as IArduinoProjectConfiguration;
			} catch { /* No previous Redbrick project configuration. */ }
		}
		if (config?.board) {
			this.board = { name: config.board.name, fqbn: baseFqbn(config.board.fqbn) };
			this.optionValues = { ...(config.options ?? {}) };
		}
		if (config?.port) {
			this.missingPort = config.port;
		}
		this.emit();
	}

	private async persistProject(): Promise<void> {
		const folder = this.projectFolder();
		if (!folder) { return; }
		const directory = vscode.Uri.joinPath(folder, '.vscode');
		await vscode.workspace.fs.createDirectory(directory);
		const uri = vscode.Uri.joinPath(directory, 'arduino.json');
		let existing: Record<string, unknown> = {};
		try { existing = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))) as Record<string, unknown>; }
		catch (error) {
			if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') { throw error; }
		}
		const { board: _board, port: _port, configuration: _configuration, ...rest } = existing;
		const data = {
			...rest,
			...(this.board ? { board: baseFqbn(this.board.fqbn) } : {}),
			...(this.port ? { port: this.port.port.address } : this.missingPort ? { port: this.missingPort } : {}),
			...(Object.keys(this.optionValues).length ? { configuration: Object.entries(this.optionValues).map(([key, value]) => `${key}=${value}`).join(',') } : {})
		};
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(data, null, '\t') + '\n'));
	}

	private projectFolder(): vscode.Uri | undefined {
		return vscode.workspace.workspaceFolders?.[0]?.uri;
	}

	private emit(): void { this.changeEmitter.fire(this.snapshot); }
	private message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}
