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

Open the **Redbrick Robot Control** activity-bar icon, enter the robot IP address, and choose **Connect**.

## Safety

The controller sends a zero velocity command when a drive button is released, the control window closes, the connection is closed, or the dead-man timer expires. Emergency Stop publishes a latched application state and repeated zero-velocity commands. A physical hardware emergency-stop circuit is still required for real machinery.

## Robot profiles

Topic, service, action, frame, and speed mappings live in `src/robotProfiles.ts`. Add a new profile instead of duplicating the UI or transport layer.
