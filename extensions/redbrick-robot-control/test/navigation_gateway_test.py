# Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License.
"""Test Nav2 acceptance/cancellation races without ROS or robot hardware."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock

for name in ['rclpy', 'rclpy.action', 'rclpy.node', 'geometry_msgs', 'geometry_msgs.msg',
		'nav2_msgs', 'nav2_msgs.action', 'std_msgs', 'std_msgs.msg']:
	sys.modules[name] = ModuleType(name)
sys.modules['rclpy.node'].Node = object
sys.modules['rclpy.action'].ActionClient = Mock
sys.modules['geometry_msgs.msg'].PoseStamped = object
sys.modules['nav2_msgs.action'].NavigateToPose = SimpleNamespace(Goal=SimpleNamespace)
sys.modules['std_msgs.msg'].Bool = object
sys.modules['std_msgs.msg'].Empty = object
sys.modules['std_msgs.msg'].String = SimpleNamespace

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).parents[1] / 'robot-setup' / 'redbrick_navigation_gateway.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GatewayTest(unittest.TestCase):
	def setUp(self):
		self.node = object.__new__(module.RedbrickNavigationGateway)
		self.node.client = Mock()
		self.node.client.server_is_ready.return_value = True
		self.node.goal_handle = None
		self.node.pending = False
		self.node.generation = 0
		self.node.estopped = False
		self.node.status = Mock()

	def test_cancel_before_acceptance_cancels_the_late_goal(self):
		self.node.navigate(SimpleNamespace())
		callback = self.node.client.send_goal_async.return_value.add_done_callback.call_args.args[0]
		self.node.cancel(None)
		handle = Mock(accepted=True)
		callback(Mock(result=Mock(return_value=handle)))
		handle.cancel_goal_async.assert_called_once()

	def test_estop_blocks_new_goals_and_cancels_active_goal(self):
		handle = Mock()
		self.node.goal_handle = handle
		self.node.emergency_stop(SimpleNamespace(data=True))
		self.node.navigate(SimpleNamespace())
		handle.cancel_goal_async.assert_called_once()
		self.node.client.send_goal_async.assert_not_called()

	def test_pending_goal_prevents_overlapping_requests(self):
		self.node.navigate(SimpleNamespace())
		self.node.navigate(SimpleNamespace())
		self.node.client.send_goal_async.assert_called_once()

	def test_old_result_does_not_clear_current_goal(self):
		handle = Mock()
		self.node.goal_handle = handle
		self.node.goal_result(Mock(), Mock())
		self.assertIs(self.node.goal_handle, handle)


if __name__ == '__main__':
	unittest.main()
