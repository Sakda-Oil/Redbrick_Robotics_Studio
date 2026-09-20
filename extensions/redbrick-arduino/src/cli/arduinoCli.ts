/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';

export interface IArduinoCliResult {
	readonly stdout: string;
	readonly stderr: string;
}

interface IArduinoCliRunOptions {
	readonly revealOutput?: boolean;
	readonly streamOutput?: boolean;
	readonly logCommand?: boolean;
}

export class ArduinoCli {
	constructor(private readonly output: vscode.OutputChannel) { }

	resolveExecutable(): string {
		const configured = vscode.workspace.getConfiguration('redbrickArduino').get<string>('cli.path')?.trim();
		if (configured) {
			return configured;
		}

		const environmentPath = process.env['ARDUINO_CLI_PATH']?.trim();
		if (environmentPath) {
			return environmentPath;
		}

		for (const candidate of this.getPlatformCandidates()) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}

		return process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
	}

	async runJson<T>(args: readonly string[], token?: vscode.CancellationToken, cwd?: string): Promise<T> {
		const result = await this.run(args, token, cwd, {
			revealOutput: false,
			streamOutput: false,
			logCommand: false
		});
		try {
			return JSON.parse(result.stdout.replace(/^\uFEFF/, '')) as T;
		} catch (error) {
			throw new Error(vscode.l10n.t('Arduino CLI returned invalid JSON: {0}', error instanceof Error ? error.message : String(error)));
		}
	}

	run(args: readonly string[], token?: vscode.CancellationToken, cwd?: string, options: IArduinoCliRunOptions = {}): Promise<IArduinoCliResult> {
		const executable = this.resolveExecutable();
		const revealOutput = options.revealOutput ?? true;
		const streamOutput = options.streamOutput ?? true;
		const logCommand = options.logCommand ?? true;
		if (logCommand) {
			this.output.appendLine(`> ${this.formatCommand(executable, args)}`);
		}
		if (revealOutput) {
			this.output.show(true);
		}

		return new Promise<IArduinoCliResult>((resolve, reject) => {
			const child = spawn(executable, [...args], { cwd, shell: false, windowsHide: true });
			let stdout = '';
			let stderr = '';
			let completed = false;

			const cancellation = token?.onCancellationRequested(() => child.kill());
			child.stdout.on('data', data => {
				const text = data.toString();
				stdout += text;
				if (streamOutput) {
					this.output.append(text);
				}
			});
			child.stderr.on('data', data => {
				const text = data.toString();
				stderr += text;
				if (streamOutput) {
					this.output.append(text);
				}
			});
			child.on('error', error => {
				if (completed) {
					return;
				}
				completed = true;
				cancellation?.dispose();
				reject(new Error(vscode.l10n.t('Unable to start Arduino CLI at {0}: {1}', executable, error.message)));
			});
			child.on('close', code => {
				if (completed) {
					return;
				}
				completed = true;
				cancellation?.dispose();
				if (logCommand || streamOutput) {
					this.output.appendLine('');
				}
				if (token?.isCancellationRequested) {
					reject(new Error(vscode.l10n.t('Arduino CLI operation was cancelled.')));
					return;
				}
				if (code !== 0) {
					const details = stderr.trim() || stdout.trim() || vscode.l10n.t('Process exited with code {0}.', code ?? -1);
					reject(new Error(details));
					return;
				}
				resolve({ stdout, stderr });
			});
		});
	}

	private getPlatformCandidates(): string[] {
		if (process.platform === 'win32') {
			const localAppData = process.env['LOCALAPPDATA'];
			const programFiles = process.env['ProgramFiles'];
			const programFilesX86 = process.env['ProgramFiles(x86)'];
			return [
				localAppData ? join(localAppData, 'Arduino15', 'arduino-cli.exe') : '',
				localAppData ? join(localAppData, 'Programs', 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe') : '',
				programFiles ? join(programFiles, 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe') : '',
				programFilesX86 ? join(programFilesX86, 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe') : ''
			].filter(Boolean);
		}
		if (process.platform === 'darwin') {
			return ['/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli'];
		}
		return ['/usr/bin/arduino-cli', '/usr/local/bin/arduino-cli', '/opt/arduino-ide/resources/app/lib/backend/resources/arduino-cli'];
	}

	private formatCommand(executable: string, args: readonly string[]): string {
		return [executable, ...args].map(value => /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value).join(' ');
	}
}
