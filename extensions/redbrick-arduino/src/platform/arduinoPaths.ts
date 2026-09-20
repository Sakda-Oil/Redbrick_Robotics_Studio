/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { existsSync } from 'fs';
import { join } from 'path';

export interface IArduinoPaths {
	readonly sketchbook: string;
	readonly data: string;
}

export class ArduinoPaths {
	static detect(platform = process.platform, home = homedir(), localAppData = process.env['LOCALAPPDATA']): IArduinoPaths {
		if (platform === 'win32') {
			const oneDriveSketchbook = process.env['OneDrive'] ? join(process.env['OneDrive'], 'Documents', 'Arduino') : undefined;
			return {
				sketchbook: oneDriveSketchbook && existsSync(oneDriveSketchbook) ? oneDriveSketchbook : join(home, 'Documents', 'Arduino'),
				data: localAppData ? join(localAppData, 'Arduino15') : join(home, 'AppData', 'Local', 'Arduino15')
			};
		}
		if (platform === 'darwin') {
			return {
				sketchbook: join(home, 'Documents', 'Arduino'),
				data: join(home, 'Library', 'Arduino15')
			};
		}
		return {
			sketchbook: join(home, 'Arduino'),
			data: join(home, '.arduino15')
		};
	}
}
