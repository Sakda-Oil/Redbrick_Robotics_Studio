/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type RobotConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface IRobotTopics {
	readonly cmdVel: string;
	readonly emergencyStop: string;
	readonly battery: string;
	readonly camera: string;
	readonly scan: string;
	readonly map: string;
	readonly odom: string;
	readonly diagnostics: string;
	readonly logs: string;
	readonly systemStatus: string;
	readonly navigationGoal: string;
	readonly navigationCancel: string;
}

export interface IRobotServices {
	readonly saveMap: string;
	readonly slamLifecycle: string;
}

export interface IRobotActions {
	readonly navigateToPose: string;
}

export interface IRobotProfile {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly topics: IRobotTopics;
	readonly services: IRobotServices;
	readonly actions: IRobotActions;
	readonly frames: {
		readonly map: string;
		readonly odom: string;
		readonly base: string;
	};
	readonly limits: {
		readonly linear: number;
		readonly angular: number;
	};
}

export interface IRosbridgeEnvelope {
	readonly op: string;
	readonly id?: string;
	readonly topic?: string;
	readonly service?: string;
	readonly action?: string;
	readonly msg?: unknown;
	readonly values?: unknown;
	readonly result?: boolean;
	readonly [key: string]: unknown;
}

export interface IRobotConnectionSettings {
	readonly host: string;
	readonly port: number;
	readonly secure: boolean;
	readonly profileId: string;
}
