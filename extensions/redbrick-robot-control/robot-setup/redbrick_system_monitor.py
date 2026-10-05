#!/usr/bin/env python3
"""Publish lightweight robot telemetry for Redbrick Robot Control."""

import json
import os
import socket
from pathlib import Path

import rclpy
from rclpy.node import Node
from std_msgs.msg import String


def cpu_sample():
	values = [int(value) for value in Path('/proc/stat').read_text(encoding='utf-8').splitlines()[0].split()[1:]]
	idle = values[3] + (values[4] if len(values) > 4 else 0)
	return sum(values), idle


def memory_sample():
	values = {}
	for line in Path('/proc/meminfo').read_text(encoding='utf-8').splitlines():
		name, raw = line.split(':', 1)
		values[name] = int(raw.strip().split()[0])
	total = values.get('MemTotal', 0) / 1024
	available = values.get('MemAvailable', 0) / 1024
	used = max(0.0, total - available)
	return total, used


def temperature():
	path = Path('/sys/class/thermal/thermal_zone0/temp')
	return round(int(path.read_text(encoding='utf-8').strip()) / 1000, 1) if path.exists() else None


def primary_ip():
	try:
		with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
			sock.connect(('8.8.8.8', 80))
			return sock.getsockname()[0]
	except OSError:
		return 'unknown'


class RedbrickSystemMonitor(Node):
	def __init__(self):
		super().__init__('redbrick_system_monitor')
		self.publisher = self.create_publisher(String, '/redbrick/system_status', 5)
		self.previous_total, self.previous_idle = cpu_sample()
		self.timer = self.create_timer(1.0, self.publish_status)

	def publish_status(self):
		total, idle = cpu_sample()
		delta_total = max(1, total - self.previous_total)
		delta_idle = max(0, idle - self.previous_idle)
		self.previous_total, self.previous_idle = total, idle
		memory_total, memory_used = memory_sample()
		payload = {
			'cpu': round(100 * (1 - delta_idle / delta_total), 1),
			'memory': round(100 * memory_used / memory_total, 1) if memory_total else 0,
			'memoryUsed': round(memory_used),
			'memoryTotal': round(memory_total),
			'temperature': temperature(),
			'ip': primary_ip(),
			'hostname': socket.gethostname(),
			'rosDistro': os.environ.get('ROS_DISTRO', 'unknown')
		}
		message = String()
		message.data = json.dumps(payload, separators=(',', ':'))
		self.publisher.publish(message)


def main():
	rclpy.init()
	node = RedbrickSystemMonitor()
	try:
		rclpy.spin(node)
	finally:
		node.destroy_node()
		rclpy.shutdown()


if __name__ == '__main__':
	main()
