# Redbrick Robot Control setup

## Architecture

Redbrick Robotics Studio runs the operator interface. The robot runs its normal ROS 2 nodes plus rosbridge. Commands and telemetry cross the trusted Wi-Fi/LAN network as rosbridge JSON over WebSocket.

```
Redbrick Robotics Studio -> rosbridge WebSocket -> ROS 2 graph -> robot hardware
```

The Robot Control extension is separate from Redbrick Arduino. Installing or configuring it does not replace local or Raspberry Pi Arduino upload.

## Raspberry Pi 5 / robot computer

1. Install Ubuntu 22.04 for Humble or Ubuntu 24.04 for Jazzy and install ROS 2.
2. In Redbrick Robotics Studio, open the Robot Control sidebar and run **Export Robot Setup Package**.
3. Copy the exported folder to the robot.
4. Run `chmod +x setup_robot_control.sh` and `sudo ./setup_robot_control.sh`.
5. Restart the login session if the setup added the user to `dialout`.
6. Start the robot's base, sensor, camera, SLAM, and Nav2 launch files as usual.
7. Keep TCP port 9090 limited to a trusted robot LAN or VPN.

The setup creates `redbrick-rosbridge.service`, `redbrick-system-monitor.service`, and `redbrick-navigation-gateway.service`. The navigation gateway avoids ROS distribution differences in rosbridge action support and forwards Redbrick goal/cancel topics to the Nav2 action server. Inspect the services with:

```bash
systemctl status redbrick-rosbridge.service
systemctl status redbrick-system-monitor.service
systemctl status redbrick-navigation-gateway.service
journalctl -u redbrick-rosbridge.service -f
```

## Expected ROS interfaces

- Motion: `/cmd_vel` (`geometry_msgs/msg/Twist`)
- Emergency state: `/emergency_stop` (`std_msgs/msg/Bool`)
- Battery: `/battery_state` (`sensor_msgs/msg/BatteryState`)
- Camera: `/camera/image_raw/compressed` (`sensor_msgs/msg/CompressedImage`)
- LiDAR: `/scan` (`sensor_msgs/msg/LaserScan`)
- Map: `/map` (`nav_msgs/msg/OccupancyGrid`)
- Odometry: `/odom` (`nav_msgs/msg/Odometry`)
- Diagnostics: `/diagnostics` (`diagnostic_msgs/msg/DiagnosticArray`)
- Navigation: `/navigate_to_pose` (`nav2_msgs/action/NavigateToPose`)

Modify or add profiles in `extensions/redbrick-robot-control/src/robotProfiles.ts` when a robot model uses different names.

## Verification

Run the extension compile and protocol tests from the Studio source directory:

```powershell
npm.cmd run gulp compile-extension:redbrick-robot-control
npm.cmd --prefix extensions/redbrick-robot-control test
```

For a hardware test, connect to the robot, hold a direction control, release it, and verify `/cmd_vel` immediately returns to zero. Then verify camera, scan, map, SLAM, map saving, and a short Nav2 goal in a safe raised-wheel or test-area setup.
