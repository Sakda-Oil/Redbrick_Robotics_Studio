# Redbrick Robot Control

Redbrick Robot Control is a built-in Redbrick Robotics Studio extension for ROS 2 mobile robots. It keeps the Arduino workflow independent and connects to a robot through `rosbridge_server` over Wi-Fi or LAN.

## Robot requirements

- Ubuntu with ROS 2 Humble or Jazzy
- `rosbridge_suite` and `rosapi`
- A robot base subscribing to `/cmd_vel`
- Optional Nav2, SLAM Toolbox, compressed camera, LaserScan, diagnostics, and battery topics

Use **Export Robot Setup Package** in the Robot Control sidebar. Copy the exported folder to the robot, then run:

```bash
chmod +x setup_robot_control.sh
sudo ./setup_robot_control.sh
```

Open the robot-shaped **Redbrick Robot Control** activity-bar icon and choose **Open Robot Control Window**. The controller opens in a separate native Studio window. Use **Settings** to save the robot IP, WebSocket port, profile, topics, services, map frame and speed limits. **Test Connection** checks rosbridge and lists missing map/sensor interfaces without moving the robot. Then choose **Connect**.

The dashboard combines a live map, camera and hold-to-drive controls. Settings, sensors and logs are available through labeled icon tabs. Changing pages, releasing drive controls or losing focus stops manual motion. Hardware operation requires matching robot-side ROS drivers and a command timeout on the robot base.

For installations upgrading from 0.1.0, export the setup package again and rerun it on the robot to update the Nav2 gateway. The new gateway reports `/redbrick/navigation_status` and handles an emergency/cancel request while a goal is awaiting acceptance.

## Safety

The controller sends a zero velocity command when a drive button is released, the control window closes, the connection is closed, or the dead-man timer expires. Emergency Stop publishes a latched application state and repeated zero-velocity commands. A physical hardware emergency-stop circuit is still required for real machinery.

## Robot profiles

Topic, service, frame and speed settings can be changed from the Settings page. Base model definitions live in `src/robotProfiles.ts`. The default gateway forwards `/redbrick/navigation_goal` to `/navigate_to_pose`; remap robot-side endpoints to match any customized gateway topics.

## Verification

Compile using `npm run gulp compile-extension:redbrick-robot-control` from the repository root. Run `npm --prefix extensions/redbrick-robot-control test`, `npm --prefix extensions/redbrick-robot-control run test:ui` (requires installed Edge and repository Playwright), and `python -B extensions/redbrick-robot-control/test/navigation_gateway_test.py`. The browser test uses a local WebSocket robot fixture; actual robot hardware still needs end-to-end validation.
