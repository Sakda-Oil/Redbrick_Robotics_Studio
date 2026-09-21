/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IArduinoBoard {
	readonly name: string;
	readonly fqbn: string;
	readonly platform?: {
		readonly name?: string;
		readonly installed?: string;
		readonly vendor?: string;
		readonly architecture?: string;
	};
}

export interface IArduinoMatchingBoard {
	readonly name: string;
	readonly fqbn: string;
}

export interface IArduinoPort {
	readonly port: {
		readonly address: string;
		readonly label?: string;
		readonly protocol?: string;
		readonly protocol_label?: string;
		readonly properties?: Readonly<Record<string, string>>;
	};
	readonly matching_boards?: readonly IArduinoMatchingBoard[];
}

export interface IArduinoBoardOptionValue {
	readonly value: string;
	readonly value_label: string;
	readonly selected?: boolean;
}

export interface IArduinoBoardOption {
	readonly option: string;
	readonly option_label: string;
	readonly values: readonly IArduinoBoardOptionValue[];
}

export interface IArduinoBoardDetails {
	readonly fqbn?: string;
	readonly name?: string;
	readonly config_options?: readonly IArduinoBoardOption[];
	readonly programmers?: readonly { readonly id: string; readonly name: string }[];
	readonly package?: { readonly name?: string; readonly maintainer?: string };
	readonly platform?: { readonly name?: string; readonly architecture?: string };
}

export interface IArduinoProjectConfiguration {
	readonly board?: { readonly name: string; readonly fqbn: string };
	readonly port?: string;
	readonly options?: Readonly<Record<string, string>>;
}

export interface IArduinoStateSnapshot {
	readonly uploadMode: 'local' | 'raspberryPi';
	readonly selectedBoard?: IArduinoBoard;
	readonly selectedFqbn?: string;
	readonly selectedPort?: IArduinoPort;
	readonly unavailablePort?: string;
	readonly availableBoards: readonly IArduinoBoard[];
	readonly availablePorts: readonly IArduinoPort[];
	readonly boardOptions: readonly IArduinoBoardOption[];
	readonly boardOptionValues: Readonly<Record<string, string>>;
	readonly loadingBoards: boolean;
	readonly loadingPorts: boolean;
	readonly loadingBoardDetails: boolean;
	readonly error?: string;
}

export interface IArduinoPlatformSuggestion {
	readonly id: string;
	readonly name: string;
	readonly maintainer: string;
	readonly version: string;
	readonly boards: readonly string[];
}
