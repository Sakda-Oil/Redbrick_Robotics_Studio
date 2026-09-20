/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { arch, platform } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { IArduinoPaths } from './platform/arduinoPaths';

interface IRipgrepMatch {
	readonly type: 'match';
	readonly data: {
		readonly path: { readonly text: string };
		readonly lines: { readonly text: string };
		readonly line_number: number;
	};
}

export class ArduinoDefinitionProvider implements vscode.DefinitionProvider {
	private readonly cache = new Map<string, vscode.Location[]>();

	constructor(private readonly paths: IArduinoPaths) { }

	async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[]> {
		const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
		if (!range) {
			return [];
		}
		const symbol = document.getText(range);
		const cached = this.cache.get(symbol);
		if (cached) {
			return cached;
		}
		const locations = await this.search(symbol, token);
		if (locations.length) {
			this.cache.set(symbol, locations);
		}
		return locations;
	}

	private async search(symbol: string, token: vscode.CancellationToken): Promise<vscode.Location[]> {
		const executable = this.findRipgrep();
		if (!executable) {
			return [];
		}
		const roots = this.searchRoots();
		if (!roots.length) {
			return [];
		}
		const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = `(?:^\\s*#\\s*define\\s+${escaped}\\b)|(?:^\\s*(?:(?:inline|static|virtual|constexpr|extern|const)\\s+)*[A-Za-z_~][A-Za-z0-9_:<>,~*&\\[\\] ]*\\s+${escaped}\\s*\\()`;
		const args = ['--json', '--max-count', '30', '--glob', '*.{h,hpp,hh,c,cc,cpp,cxx,ino}', '--glob', '!**/examples/**', pattern, ...roots];
		return new Promise(resolve => {
			const child = spawn(executable, args, { shell: false, windowsHide: true });
			let stdout = '';
			child.stdout.setEncoding('utf8');
			child.stdout.on('data', (value: string) => stdout += value);
			child.once('error', () => resolve([]));
			child.once('close', () => resolve(this.parseMatches(stdout, symbol)));
			const cancellation = token.onCancellationRequested(() => child.kill());
			child.once('close', () => cancellation.dispose());
		});
	}

	private parseMatches(output: string, symbol: string): vscode.Location[] {
		const locations: vscode.Location[] = [];
		const seen = new Set<string>();
		for (const line of output.split(/\r?\n/)) {
			if (!line) {
				continue;
			}
			try {
				const event = JSON.parse(line) as IRipgrepMatch;
				if (event.type !== 'match') {
					continue;
				}
				const sourceLine = event.data.lines.text;
				const column = sourceLine.indexOf(symbol);
				if (column < 0 || /^\s*(?:return|if|while|for|switch)\b/.test(sourceLine)) {
					continue;
				}
				const key = `${event.data.path.text}:${event.data.line_number}:${column}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				locations.push(new vscode.Location(vscode.Uri.file(event.data.path.text), new vscode.Position(event.data.line_number - 1, column)));
			} catch {
				// Ignore non-match output from ripgrep.
			}
		}
		return locations;
	}

	private searchRoots(): string[] {
		const candidates = [
			...(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? []),
			join(this.paths.sketchbook, 'libraries'),
			join(this.paths.data, 'packages')
		];
		return [...new Set(candidates.filter(candidate => existsSync(candidate)))];
	}

	private findRipgrep(): string | undefined {
		const executable = platform() === 'win32' ? 'rg.exe' : 'rg';
		const architecture = arch() === 'arm64' ? 'arm64' : arch() === 'ia32' ? 'ia32' : 'x64';
		const candidates = [
			join(vscode.env.appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep-universal', 'bin', `${platform()}-${architecture}`, executable),
			join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', `${platform()}-${architecture}`, executable),
			join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', executable)
		];
		return candidates.find(candidate => existsSync(candidate));
	}
}
