#!/usr/bin/env bash
# Raspberry Pi 5 provisioning for the Redbrick USB upload bridge.
# Compilation, board cores, libraries, and micro-ROS remain on the Studio computer.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
	echo "Run this script with sudo: sudo ./setup_pi.sh" >&2
	exit 1
fi

RB_USER="${REDBRICK_PI_USER:-${SUDO_USER:-pi}}"
if ! id "${RB_USER}" >/dev/null 2>&1; then
	echo "User '${RB_USER}' does not exist. Set REDBRICK_PI_USER to the SSH user." >&2
	exit 1
fi

echo "[1/4] Checking network and DNS"
if ! getent hosts ports.ubuntu.com >/dev/null 2>&1; then
	echo "DNS is unavailable. Connect the Pi to the internet, then run this script again." >&2
	echo "Test with: ping -c 3 8.8.8.8 && getent hosts ports.ubuntu.com" >&2
	exit 2
fi

echo "[2/4] Installing bridge-only upload dependencies"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server python3 python3-serial esptool avrdude openocd usbutils
systemctl enable --now ssh

echo "[3/4] Granting USB serial access to ${RB_USER}"
usermod -aG dialout "${RB_USER}"
if getent group plugdev >/dev/null 2>&1; then
	usermod -aG plugdev "${RB_USER}"
fi

echo "[4/4] Checking bridge tools and USB ports"
command -v sshd
python3 -m esptool version
command -v avrdude
command -v openocd
sudo -u "${RB_USER}" -H python3 -m serial.tools.list_ports -v || true

cat <<EOF

Raspberry Pi USB bridge setup completed.

The Pi does not compile sketches and has no Arduino board cores or libraries.
Redbrick Robotics Studio compiles locally, including micro-ROS and project packages,
then sends only the resulting firmware to this Pi for USB upload.

Next steps:
1. Reboot or sign out/in so ${RB_USER} receives the dialout group.
2. Copy your Studio computer SSH public key to ${RB_USER}@$(hostname -I | awk '{print $1}').
3. In Redbrick Robotics Studio select "Raspberry Pi Bridge" and test the connection.

No SSH password is stored by Redbrick Robotics Studio.
EOF
