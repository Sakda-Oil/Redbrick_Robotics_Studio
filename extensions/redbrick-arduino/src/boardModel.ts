/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IArduinoBoard, IArduinoBoardOption, IArduinoPort } from './arduinoTypes';

export function baseFqbn(fqbn: string): string {
	return fqbn.split(':').slice(0, 3).join(':');
}

export function parseFqbnOptions(fqbn: string): Record<string, string> {
	const optionText = fqbn.split(':').slice(3).join(':');
	return Object.fromEntries(optionText.split(',').filter(Boolean).map(entry => {
		const separator = entry.indexOf('=');
		return separator < 0 ? [entry, ''] : [entry.slice(0, separator), entry.slice(separator + 1)];
	}));
}

export function composeFqbn(fqbn: string, options: Readonly<Record<string, string>>): string {
	const entries = Object.entries(options).filter(([, value]) => value !== '');
	return entries.length ? `${baseFqbn(fqbn)}:${entries.map(([key, value]) => `${key}=${value}`).join(',')}` : baseFqbn(fqbn);
}

export function optionDefaults(options: readonly IArduinoBoardOption[]): Record<string, string> {
	return Object.fromEntries(options.map(option => [option.option, option.values.find(value => value.selected)?.value ?? option.values[0]?.value ?? '']));
}

export function boardSearchText(board: IArduinoBoard): string {
	const [vendor = '', architecture = ''] = board.fqbn.split(':');
	return [board.name, board.fqbn, vendor, architecture, board.platform?.name, board.platform?.vendor, board.platform?.architecture].filter(Boolean).join(' ').toLocaleLowerCase();
}

export function filterBoards(boards: readonly IArduinoBoard[], query: string, limit = 120): readonly IArduinoBoard[] {
	const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const matches = terms.length ? boards.filter(board => {
		const searchable = boardSearchText(board);
		return terms.every(term => searchable.includes(term));
	}) : boards;
	return matches.slice(0, Math.max(1, limit));
}

/** Match persisted/configured boards by base FQBN so dynamic option suffixes never break selection. */
export function findBoardByFqbn(boards: readonly IArduinoBoard[], fqbn: string): IArduinoBoard | undefined {
	const expected = baseFqbn(fqbn);
	return boards.find(board => baseFqbn(board.fqbn) === expected);
}

export function portDisplayName(port: IArduinoPort): string {
	return port.port.label || port.port.address;
}

export function isLikelyUploadPort(port: IArduinoPort): boolean {
	return Boolean(port.matching_boards?.length || port.port.properties?.vid || port.port.properties?.pid || /USB|ACM|UART/i.test(`${port.port.label ?? ''} ${port.port.protocol_label ?? ''}`));
}
