/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRobotProfile } from './robotTypes';

const common = {
	topics: {
		cmdVel: '/cmd_vel',
		emergencyStop: '/emergency_stop',
		battery: '/battery_state',
		camera: '/camera/image_raw/compressed',
		scan: '/scan',
		map: '/map',
		odom: '/odom',
		diagnostics: '/diagnostics',
		logs: '/rosout',
		systemStatus: '/redbrick/system_status',
		navigationGoal: '/redbrick/navigation_goal',
		navigationCancel: '/redbrick/cancel_navigation',
		navigationStatus: '/redbrick/navigation_status'
	},
	services: {
		saveMap: '/map_saver/save_map',
		slamLifecycle: '/slam_toolbox/change_state'
	},
	actions: {
		navigateToPose: '/navigate_to_pose'
	},
	frames: {
		map: 'map',
		odom: 'odom',
		base: 'base_link'
	}
} as const;

export const robotProfiles: readonly IRobotProfile[] = [
	{
		id: 'redbrick-diff-drive-v1',
		name: 'Redbrick Differential Drive',
		description: 'Redbrick two-wheel differential drive robot with ROS 2 and Nav2 gateway.',
		...common,
		limits: { linear: 0.5, angular: 1.5 }
	},
	{
		id: 'generic-diff-drive',
		name: 'Generic ROS 2 Differential Drive',
		description: 'Standard ROS 2 topic and frame names for compatible mobile robots.',
		...common,
		limits: { linear: 0.35, angular: 1.0 }
	}
];

export function robotProfile(id: string): IRobotProfile {
	return robotProfiles.find(profile => profile.id === id) ?? robotProfiles[0];
}
