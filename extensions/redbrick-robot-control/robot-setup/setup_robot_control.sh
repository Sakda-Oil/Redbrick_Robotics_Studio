#!/usr/bin/env bash
# Exported by Redbrick Robotics Studio to install the ROS 2 robot gateway.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "Run with sudo: sudo ./setup_robot_control.sh" >&2
	exit 1
fi

RB_USER="${REDBRICK_ROBOT_USER:-${SUDO_USER:-pi}}"
if ! id "${RB_USER}" >/dev/null 2>&1; then
	echo "User '${RB_USER}' does not exist. Set REDBRICK_ROBOT_USER first." >&2
	exit 1
fi

ROS_DISTRO="${REDBRICK_ROS_DISTRO:-${ROS_DISTRO:-}}"
if [[ -z "${ROS_DISTRO}" ]]; then
	if [[ -d /opt/ros/jazzy ]]; then ROS_DISTRO=jazzy
	elif [[ -d /opt/ros/humble ]]; then ROS_DISTRO=humble
	else
		echo "ROS 2 Humble or Jazzy is required before installing Robot Control." >&2
		exit 2
	fi
fi
if [[ "${ROS_DISTRO}" != "humble" && "${ROS_DISTRO}" != "jazzy" ]]; then
	echo "Unsupported ROS distribution '${ROS_DISTRO}'. Use humble or jazzy." >&2
	exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SOURCE="${SCRIPT_DIR}/redbrick_system_monitor.py"
NAVIGATION_SOURCE="${SCRIPT_DIR}/redbrick_navigation_gateway.py"
if [[ ! -f "${MONITOR_SOURCE}" || ! -f "${NAVIGATION_SOURCE}" ]]; then
	echo "Keep redbrick_system_monitor.py and redbrick_navigation_gateway.py beside setup_robot_control.sh." >&2
	exit 3
fi

echo "[1/5] Installing ROS bridge for ROS 2 ${ROS_DISTRO}"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y "ros-${ROS_DISTRO}-rosbridge-suite" "ros-${ROS_DISTRO}-rosapi" "ros-${ROS_DISTRO}-nav2-msgs" python3

echo "[2/5] Installing Redbrick system monitor"
install -d -m 0755 /opt/redbrick-robot-control
install -m 0755 "${MONITOR_SOURCE}" /opt/redbrick-robot-control/redbrick_system_monitor.py
install -m 0755 "${NAVIGATION_SOURCE}" /opt/redbrick-robot-control/redbrick_navigation_gateway.py
usermod -aG dialout "${RB_USER}"

echo "[3/5] Creating ROS environment"
cat >/etc/default/redbrick-robot-control <<EOF
ROS_DISTRO=${ROS_DISTRO}
ROS_DOMAIN_ID=${REDBRICK_ROS_DOMAIN_ID:-0}
REDBRICK_ROSBRIDGE_PORT=${REDBRICK_ROSBRIDGE_PORT:-9090}
EOF

cat >/etc/systemd/system/redbrick-rosbridge.service <<EOF
[Unit]
Description=Redbrick Robot Control ROS bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RB_USER}
EnvironmentFile=/etc/default/redbrick-robot-control
ExecStart=/bin/bash -lc 'source /opt/ros/\${ROS_DISTRO}/setup.bash && exec ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=\${REDBRICK_ROSBRIDGE_PORT}'
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/redbrick-system-monitor.service <<EOF
[Unit]
Description=Redbrick Robot Control system telemetry
After=redbrick-rosbridge.service

[Service]
Type=simple
User=${RB_USER}
EnvironmentFile=/etc/default/redbrick-robot-control
ExecStart=/bin/bash -lc 'source /opt/ros/\${ROS_DISTRO}/setup.bash && exec python3 /opt/redbrick-robot-control/redbrick_system_monitor.py'
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/redbrick-navigation-gateway.service <<EOF
[Unit]
Description=Redbrick Robot Control Nav2 gateway
After=redbrick-rosbridge.service

[Service]
Type=simple
User=${RB_USER}
EnvironmentFile=/etc/default/redbrick-robot-control
ExecStart=/bin/bash -lc 'source /opt/ros/\${ROS_DISTRO}/setup.bash && exec python3 /opt/redbrick-robot-control/redbrick_navigation_gateway.py'
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "[4/5] Starting services"
systemctl daemon-reload
systemctl enable --now redbrick-rosbridge.service redbrick-system-monitor.service redbrick-navigation-gateway.service

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
	ufw allow "${REDBRICK_ROSBRIDGE_PORT:-9090}/tcp"
fi

echo "[5/5] Verifying services"
systemctl --no-pager --full status redbrick-rosbridge.service | sed -n '1,12p'
systemctl --no-pager --full status redbrick-system-monitor.service | sed -n '1,12p'
systemctl --no-pager --full status redbrick-navigation-gateway.service | sed -n '1,12p'

cat <<EOF

Redbrick Robot Control gateway is ready.
ROS 2 distribution : ${ROS_DISTRO}
ROS domain ID      : ${REDBRICK_ROS_DOMAIN_ID:-0}
WebSocket port     : ${REDBRICK_ROSBRIDGE_PORT:-9090}
Robot IP           : $(hostname -I | awk '{print $1}')

Use this IP and port in Redbrick Robot Control.
Keep port 9090 on a trusted robot LAN or protect it with a VPN/firewall.
EOF
