/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { basename, posix } from 'path';
import * as vscode from 'vscode';

export type ArduinoUploadMode = 'local' | 'raspberryPi';

export interface IRaspberryPiSettings {
	readonly host: string;
	readonly username: string;
	readonly sshKeyPath: string;
	readonly sshPort: number;
	readonly cliPath: string;
	readonly temporaryRoot: string;
}

export interface IRemoteRunOptions {
	readonly revealOutput?: boolean;
	readonly streamOutput?: boolean;
	readonly logCommand?: boolean;
}

export interface IRemoteCommandResult {
	readonly stdout: string;
	readonly stderr: string;
}

export interface IRemoteSketchSession {
	readonly sketchPath: string;
	readonly buildPath: string;
	cleanup(): Promise<void>;
}

export class RaspberryPiService {
	constructor(private readonly output: vscode.OutputChannel) { }

	get uploadMode(): ArduinoUploadMode {
		return vscode.workspace.getConfiguration('redbrickArduino').get<ArduinoUploadMode>('upload.mode', 'local');
	}

	get isEnabled(): boolean { return this.uploadMode === 'raspberryPi'; }

	readSettings(): IRaspberryPiSettings {
		const configuration = vscode.workspace.getConfiguration('redbrickArduino');
		return {
			host: configuration.get<string>('remote.host', '').trim(),
			username: configuration.get<string>('remote.username', 'pi').trim(),
			sshKeyPath: configuration.get<string>('remote.sshKeyPath', '').trim(),
			sshPort: configuration.get<number>('remote.sshPort', 22),
			cliPath: configuration.get<string>('remote.cliPath', 'arduino-cli').trim() || 'arduino-cli',
			temporaryRoot: configuration.get<string>('remote.temporaryRoot', '/tmp/redbrick-arduino').trim() || '/tmp/redbrick-arduino'
		};
	}

	async runCli(args: readonly string[], token?: vscode.CancellationToken, options: IRemoteRunOptions = {}): Promise<IRemoteCommandResult> {
		const settings = this.validate(this.readSettings());
		return this.runSsh([settings.cliPath, ...args], settings, token, options);
	}

	async testConnection(settings = this.readSettings(), token?: vscode.CancellationToken): Promise<string> {
		const valid = this.validate(settings);
		const result = await this.runSsh(['sh', '-c', 'printf "Redbrick Pi: "; uname -srmo; printf "Arduino CLI: "; command -v "$1"; "$1" version', 'redbrick-test', valid.cliPath], valid, token, { revealOutput: true, streamOutput: true });
		return result.stdout.trim();
	}

	async stageSketch(localSketchPath: string, token: vscode.CancellationToken, report: (message: string) => void): Promise<IRemoteSketchSession> {
		const settings = this.validate(this.readSettings());
		const jobRoot = posix.join(settings.temporaryRoot, `job-${randomUUID()}`);
		const sketchName = basename(localSketchPath);
		const remoteSketchPath = posix.join(jobRoot, sketchName);
		const buildPath = posix.join(jobRoot, 'build');
		report(vscode.l10n.t('Creating a temporary workspace on Raspberry Pi…'));
		await this.runSsh(['mkdir', '-p', jobRoot, buildPath], settings, token, { revealOutput: false });
		try {
			report(vscode.l10n.t('Synchronizing sketch to Raspberry Pi…'));
			await this.runProcess('scp', [...this.connectionArguments(settings, true), '-r', localSketchPath, `${this.target(settings)}:${jobRoot}/`], token, { revealOutput: true, streamOutput: true, logCommand: true });
		} catch (error) {
			await this.cleanup(jobRoot, settings);
			throw error;
		}
		let cleaned = false;
		return {
			sketchPath: remoteSketchPath,
			buildPath,
			cleanup: async () => {
				if (cleaned) { return; }
				cleaned = true;
				report(vscode.l10n.t('Removing temporary files from Raspberry Pi…'));
				await this.cleanup(jobRoot, settings);
			}
		};
	}

	private async cleanup(jobRoot: string, settings: IRaspberryPiSettings): Promise<void> {
		if (!jobRoot.startsWith(`${settings.temporaryRoot.replace(/\/$/, '')}/job-`)) {
			throw new Error(vscode.l10n.t('Refusing to remove an unsafe Raspberry Pi path: {0}', jobRoot));
		}
		try {
			await this.runSsh(['rm', '-rf', '--', jobRoot], settings, undefined, { revealOutput: false, streamOutput: false, logCommand: false });
		} catch (error) {
			this.output.appendLine(vscode.l10n.t('Warning: unable to remove Raspberry Pi temporary files: {0}', error instanceof Error ? error.message : String(error)));
		}
	}

	private runSsh(command: readonly string[], settings: IRaspberryPiSettings, token?: vscode.CancellationToken, options: IRemoteRunOptions = {}): Promise<IRemoteCommandResult> {
		const remoteCommand = command.map(value => this.shellQuote(value)).join(' ');
		return this.runProcess('ssh', [...this.connectionArguments(settings, false), this.target(settings), remoteCommand], token, options);
	}

	private runProcess(executable: string, args: readonly string[], token?: vscode.CancellationToken, options: IRemoteRunOptions = {}): Promise<IRemoteCommandResult> {
		const revealOutput = options.revealOutput ?? true;
		const streamOutput = options.streamOutput ?? true;
		const logCommand = options.logCommand ?? true;
		if (logCommand) { this.output.appendLine(`> ${this.formatCommand(executable, args)}`); }
		if (revealOutput) { this.output.show(true); }
		return new Promise<IRemoteCommandResult>((resolve, reject) => {
			const child = spawn(executable, [...args], { shell: false, windowsHide: true });
			let stdout = '';
			let stderr = '';
			let completed = false;
			const cancellation = token?.onCancellationRequested(() => child.kill());
			child.stdout.on('data', data => { const text = data.toString(); stdout += text; if (streamOutput) { this.output.append(text); } });
			child.stderr.on('data', data => { const text = data.toString(); stderr += text; if (streamOutput) { this.output.append(text); } });
			child.on('error', error => {
				if (completed) { return; }
				completed = true;
				cancellation?.dispose();
				reject(new Error(vscode.l10n.t('Unable to start {0}: {1}', executable, error.message)));
			});
			child.on('close', code => {
				if (completed) { return; }
				completed = true;
				cancellation?.dispose();
				if (logCommand || streamOutput) { this.output.appendLine(''); }
				if (token?.isCancellationRequested) { reject(new Error(vscode.l10n.t('Raspberry Pi operation was cancelled.'))); return; }
				if (code !== 0) { reject(new Error((stderr.trim() || stdout.trim() || vscode.l10n.t('Process exited with code {0}.', code ?? -1)))); return; }
				resolve({ stdout, stderr });
			});
		});
	}

	private connectionArguments(settings: IRaspberryPiSettings, scp: boolean): string[] {
		return [scp ? '-P' : '-p', String(settings.sshPort), '-i', settings.sshKeyPath, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15'];
	}

	private target(settings: IRaspberryPiSettings): string { return `${settings.username}@${settings.host.includes(':') ? `[${settings.host}]` : settings.host}`; }

	private validate(settings: IRaspberryPiSettings): IRaspberryPiSettings {
		if (!/^[A-Za-z0-9._:-]+$/.test(settings.host)) { throw new Error(vscode.l10n.t('Configure a valid Raspberry Pi hostname or IP address.')); }
		if (!/^[A-Za-z_][A-Za-z0-9._-]*$/.test(settings.username)) { throw new Error(vscode.l10n.t('Configure a valid Raspberry Pi SSH username.')); }
		if (!settings.sshKeyPath || !existsSync(settings.sshKeyPath)) { throw new Error(vscode.l10n.t('Select an existing SSH private key for Raspberry Pi. Passwords are not stored or used.')); }
		if (!Number.isInteger(settings.sshPort) || settings.sshPort < 1 || settings.sshPort > 65535) { throw new Error(vscode.l10n.t('SSH port must be between 1 and 65535.')); }
		if (!/^\/[A-Za-z0-9_./-]+$/.test(settings.temporaryRoot)) { throw new Error(vscode.l10n.t('Raspberry Pi temporary root must be a safe absolute Linux path without spaces.')); }
		return settings;
	}

	private shellQuote(value: string): string { return `'${value.replace(/'/g, `'"'"'`)}'`; }
	private formatCommand(executable: string, args: readonly string[]): string { return [executable, ...args].map(value => /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value).join(' '); }
}
