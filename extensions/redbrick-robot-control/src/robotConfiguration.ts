/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isIP } from 'net';
import { robotProfile, robotProfiles } from './robotProfiles';
import { IRobotConnectionSettings, IRobotProfile } from './robotTypes';

export interface IRobotCustomization {
	readonly topics?: Partial<IRobotProfile['topics']>;
	readonly services?: Partial<IRobotProfile['services']>;
	readonly frames?: Partial<IRobotProfile['frames']>;
	readonly limits?: Partial<IRobotProfile['limits']>;
}

export interface ISavedRobotSettings extends IRobotConnectionSettings {
	readonly customization?: IRobotCustomization;
}

export function configuredProfile(settings: ISavedRobotSettings): IRobotProfile {
	const base = robotProfile(settings.profileId);
	const overrides = settings.customization || {};
	const result = { ...base, topics: { ...base.topics }, services: { ...base.services }, frames: { ...base.frames }, limits: { ...base.limits } };
	for (const group of ['topics', 'services', 'frames'] as const) {
		const values = overrides[group];
		for (const key of Object.keys(result[group])) {
			const value = (values as Record<string, string> | undefined)?.[key];
			if (value === undefined) { continue; }
			const pattern = group === 'frames' ? /^[A-Za-z_][A-Za-z0-9_/]*$/ : /^\/(?:[A-Za-z_][A-Za-z0-9_]*)(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/;
			if (typeof value !== 'string' || !pattern.test(value)) { throw new Error(`Invalid ROS ${group}: ${key}. Use a valid ROS name.`); }
			(result[group] as Record<string, string>)[key] = value;
		}
	}
	for (const [key, max] of [['linear', 2], ['angular', 4]] as const) {
		const value = overrides.limits?.[key] ?? base.limits[key];
		if (!Number.isFinite(value) || value <= 0 || value > max) { throw new Error(`The ${key} speed limit must be greater than zero and at most ${max}.`); }
		result.limits[key] = value;
	}
	return result;
}

export function validateRobotSettings(settings: ISavedRobotSettings): ISavedRobotSettings {
	const host = settings.host.trim().replace(/^\[|\]$/g, '');
	if (!isIP(host) && !/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) { throw new Error('Enter a robot IP address or hostname, without a URL or path.'); }
	if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) { throw new Error('Port must be between 1 and 65535.'); }
	if (!robotProfiles.some(profile => profile.id === settings.profileId)) { throw new Error('Choose an available robot profile.'); }
	configuredProfile(settings);
	return { ...settings, host, secure: Boolean(settings.secure) };
}

export function robotUrl(settings: IRobotConnectionSettings): string {
	return `${settings.secure ? 'wss' : 'ws'}://${isIP(settings.host) === 6 ? `[${settings.host}]` : settings.host}:${settings.port}`;
}
