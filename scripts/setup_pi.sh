#!/usr/bin/env bash
# Raspberry Pi 5 provisioning for Redbrick Robotics Studio remote Arduino upload.
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

echo "[1/6] Installing Raspberry Pi dependencies"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl openssh-server python3 python3-serial git avrdude openocd usbutils
systemctl enable --now ssh

echo "[2/6] Granting USB serial access to ${RB_USER}"
usermod -aG dialout "${RB_USER}"
if getent group plugdev >/dev/null 2>&1; then
	usermod -aG plugdev "${RB_USER}"
fi

if ! command -v arduino-cli >/dev/null 2>&1; then
	echo "[3/6] Installing Arduino CLI"
	INSTALLER="$(mktemp)"
	trap 'rm -f "${INSTALLER}"' EXIT
	curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh -o "${INSTALLER}"
	BINDIR=/usr/local/bin sh "${INSTALLER}"
else
	echo "[3/6] Arduino CLI already installed: $(arduino-cli version)"
fi

run_as_user() {
	sudo -u "${RB_USER}" -H "$@"
}

echo "[4/6] Initializing Arduino CLI configuration"
run_as_user arduino-cli config init >/dev/null 2>&1 || true
run_as_user arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json >/dev/null 2>&1 || true
run_as_user arduino-cli config add board_manager.additional_urls https://arduino.esp8266.com/stable/package_esp8266com_index.json >/dev/null 2>&1 || true

echo "[5/6] Installing Arduino AVR, ESP32, and ESP8266 cores"
run_as_user arduino-cli core update-index
for core in arduino:avr esp32:esp32 esp8266:esp8266; do
	if ! run_as_user arduino-cli core list | awk '{print $1}' | grep -Fxq "${core}"; then
		run_as_user arduino-cli core install "${core}"
	else
		echo "${core} is already installed"
	fi
done

echo "[6/6] Checking Arduino CLI and USB ports"
run_as_user arduino-cli version
run_as_user arduino-cli board list || true

cat <<EOF

Raspberry Pi setup completed.

Next steps:
1. Reboot or sign out/in so ${RB_USER} receives the dialout group.
2. Copy your PC/Mac SSH public key to ${RB_USER}@$(hostname -I | awk '{print $1}').
3. In Redbrick Robotics Studio open "Configure Raspberry Pi Upload".
4. Select the private key on the PC/Mac and click "Test Connection".

No SSH password is stored by Redbrick Robotics Studio.
EOF
