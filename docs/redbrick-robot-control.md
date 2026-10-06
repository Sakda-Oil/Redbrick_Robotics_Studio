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

## Operator window and settings (0.2.0)

Choose **Open Robot Control Window** from the robot-shaped sidebar icon. Studio opens a native separate window, which can be moved to another screen. Studio remains the host application; this is not an independently installed application. The dashboard shows map, camera and hold-to-drive buttons together. Tabs have both icons and readable labels.

Open **Settings**, enter the robot IP/hostname, port (normally 9090), and robot profile. You can edit camera, velocity, LiDAR, map, battery and other topic names, map/SLAM services, map frame, and maximum speeds. Choose **Save Settings**; settings are stored on this computer and work without an open project folder. Disconnect before changing a live connection. WSS requires a TLS-enabled rosbridge endpoint.

**Test Connection** makes a read-only rosbridge connection and asks rosapi for topics/services. It reports missing sensor/map endpoints; it never publishes velocity. Successful transport does not establish that motor controllers, camera drivers or Nav2 are configured correctly. Start the robot's own launch files first.

The connection supports ROS 2 `geometry_msgs/msg/Twist` and compressed JPEG/PNG images. If a robot uses `TwistStamped`, raw images, a different SLAM backend, or vendor-specific services, configure a robot-side adapter. The SLAM buttons activate/deactivate an already configured lifecycle node; they do not launch arbitrary processes. Save Map uses the Nav2 map-saver service and reports a rejected save as a failure.

Navigation requires the bundled gateway. Version 0.2.0 adds `/redbrick/navigation_status` (`std_msgs/msg/String`) and guards cancellation while Nav2 is still accepting a goal. Re-export the robot setup package and rerun setup on robots using the older gateway. The gateway's default goal, cancel, emergency and status topic names must match Studio; remap the corresponding robot-side ROS names if you customize those fields. Occupied/unknown map cells cannot be selected, and the map-origin orientation is applied to goal coordinates.

Emergency Stop cancels navigation and publishes zero velocity. It remains set until explicitly reset, including after reconnecting within the same session. Motion stops on button/key release, changing pages, hiding the window or host heartbeat timeout. On a lost network the Studio cannot deliver a stop packet: the robot base must implement its own command timeout and hardware stop. No hardware connection is automatically started when opening a window.

## Reference comparison

- [Yahboom ROS Robot navigation](https://www.yahboom.net/public/upload/upload-html/1737511967/ROS%20Robot%20APP%20navigation.html): IP-based connection, configurable compressed camera topic, map interaction and robot-side ROS launch prerequisites.
- [Foxglove Teleop](https://docs.foxglove.dev/docs/visualization/panels/teleop): configurable Twist topic and stop-on-release directional controls.

These references informed the operator layout and topic configuration; Redbrick does not reuse their branding or claim hardware compatibility based on appearance.

## Verification

Run the extension compile and protocol tests from the Studio source directory:

```powershell
npm.cmd run gulp compile-extension:redbrick-robot-control
npm.cmd --prefix extensions/redbrick-robot-control test
npm.cmd --prefix extensions/redbrick-robot-control run test:ui
python -B extensions/redbrick-robot-control/test/navigation_gateway_test.py
```

The UI test uses the repository's Playwright dependency and an installed Microsoft Edge, starts a local WebSocket ROS fixture, and checks actual DOM interactions, settings persistence, telemetry, motion release/page changes/dead-man timeout, E-stop, rotated-map goals, failed ROS services, and tablet overflow. It never connects to a physical robot. Native window detachment must additionally be checked in the packaged desktop application.

Build Windows from the repository root using `./scripts/build-windows.ps1 -Architecture x64 -Installer user`. The built-in extension's `media` files and `robot-setup` directory must be included with its compiled `out` files. Linux and macOS still require their normal platform builds; Windows packaging does not validate those targets.

For a hardware test, connect to the robot, hold a direction control, release it, and verify `/cmd_vel` immediately returns to zero. Then verify camera, scan, map, SLAM, map saving, and a short Nav2 goal in a safe raised-wheel or test-area setup.
