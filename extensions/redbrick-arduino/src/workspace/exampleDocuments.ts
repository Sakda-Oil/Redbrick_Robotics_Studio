/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { ensureProjectConfiguration } from './projectConfiguration';

interface ExampleDocument {
	readonly source: vscode.Uri;
	readonly name: string;
	readonly fqbn: string;
	content: Uint8Array;
	destination?: vscode.Uri;
}

/** Editable examples: source packages are never written; first Save copies the entire sketch. */
export class ExampleDocuments implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile = this.changed.event;
	private readonly documents = new Map<string, ExampleDocument>();
	private readonly registration = vscode.workspace.registerFileSystemProvider('redbrick-example', this, { isCaseSensitive: true });

	async open(folder: string, fqbn: string): Promise<void> {
		const source = vscode.Uri.file(folder);
		const name = basename(folder);
		const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(source, `${name}.ino`));
		const uri = vscode.Uri.from({ scheme: 'redbrick-example', path: `/${randomUUID()}/${name}.ino` });
		this.documents.set(uri.toString(), { source, name, fqbn, content: new Uint8Array() });
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 'arduino');
		await vscode.window.showTextDocument(document, { preview: false });
		const edit = new vscode.WorkspaceEdit();
		edit.insert(uri, new vscode.Position(0, 0), new TextDecoder().decode(content));
		await vscode.workspace.applyEdit(edit);
	}

	private get(uri: vscode.Uri): ExampleDocument {
		const entry = this.documents.get(uri.toString());
		if (!entry) { throw vscode.FileSystemError.FileNotFound(uri); }
		return entry;
	}

	async saveForBuild(document: vscode.TextDocument): Promise<string | undefined> {
		if (!await document.save()) { return undefined; }
		return this.get(document.uri).destination?.fsPath;
	}

	stat(uri: vscode.Uri): vscode.FileStat { return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: this.get(uri).content.length }; }
	readFile(uri: vscode.Uri): Uint8Array { return this.get(uri).content; }
	watch(): vscode.Disposable { return new vscode.Disposable(() => {}); }
	readDirectory(): [string, vscode.FileType][] { return []; }
	createDirectory(): void { throw vscode.FileSystemError.NoPermissions(); }
	delete(): void { throw vscode.FileSystemError.NoPermissions(); }
	rename(): void { throw vscode.FileSystemError.NoPermissions(); }

	async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
		const entry = this.get(uri);
		if (!entry.destination) {
			const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: vscode.l10n.t('Save Example as a New Arduino Project'), openLabel: vscode.l10n.t('Save Project Here') });
			if (!selected?.length) { throw new vscode.CancellationError(); }
			const target = vscode.Uri.joinPath(selected[0], entry.name);
			await vscode.workspace.fs.copy(entry.source, target, { overwrite: false });
			await ensureProjectConfiguration(target, entry.fqbn);
			entry.destination = target;
		}
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(entry.destination, `${entry.name}.ino`), content);
		entry.content = content;
		void vscode.window.showInformationMessage(vscode.l10n.t('Example saved to {0}', entry.destination.fsPath), vscode.l10n.t('Open Project')).then(action => {
			if (action) { return vscode.commands.executeCommand('vscode.openFolder', entry.destination, false); }
			return undefined;
		});
	}

	dispose(): void { this.registration.dispose(); this.changed.dispose(); this.documents.clear(); }
}
