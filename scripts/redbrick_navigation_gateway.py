#!/usr/bin/env python3
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Topic-to-Nav2 gateway for Humble/Jazzy with cancellation during goal acceptance."""

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient
from rclpy.node import Node
from std_msgs.msg import Bool, Empty, String


class RedbrickNavigationGateway(Node):
	def __init__(self):
		super().__init__('redbrick_navigation_gateway')
		self.client = ActionClient(self, NavigateToPose, '/navigate_to_pose')
		self.goal_handle = None
		self.pending = False
		self.generation = 0
		self.estopped = False
		self.status_publisher = self.create_publisher(String, '/redbrick/navigation_status', 5)
		self.create_subscription(PoseStamped, '/redbrick/navigation_goal', self.navigate, 5)
		self.create_subscription(Empty, '/redbrick/cancel_navigation', self.cancel, 5)
		self.create_subscription(Bool, '/emergency_stop', self.emergency_stop, 5)

	def status(self, text):
		self.status_publisher.publish(String(data=text))
		self.get_logger().info(text)

	def navigate(self, pose):
		if self.estopped:
			self.status('Goal rejected: emergency stop is active')
			return
		if self.pending or self.goal_handle is not None:
			self.status('Goal rejected: cancel the current navigation first')
			return
		if not self.client.server_is_ready():
			self.status('Nav2 /navigate_to_pose action server is unavailable')
			return
		self.generation += 1
		generation = self.generation
		self.pending = True
		goal = NavigateToPose.Goal()
		goal.pose = pose
		try:
			future = self.client.send_goal_async(goal)
			future.add_done_callback(lambda result: self.goal_response(result, generation))
			self.status('Waiting for Nav2 goal acceptance')
		except Exception as error:
			self.pending = False
			self.status(f'Navigation request failed: {error}')

	def goal_response(self, future, generation):
		self.pending = False
		try:
			handle = future.result()
			if not handle or not handle.accepted:
				self.status('Navigation goal was rejected')
				return
			self.goal_handle = handle
			handle.get_result_async().add_done_callback(
				lambda result: self.goal_result(result, handle))
			if generation != self.generation or self.estopped:
				self.cancel(None)
			else:
				self.status('Navigation goal accepted')
		except Exception as error:
			self.status(f'Navigation goal response failed: {error}')

	def goal_result(self, future, handle):
		if self.goal_handle is not handle:
			return
		self.goal_handle = None
		try:
			code = future.result().status
			self.status({4: 'Navigation succeeded', 5: 'Navigation cancelled',
				6: 'Navigation aborted'}.get(code, f'Navigation finished: status {code}'))
		except Exception as error:
			self.status(f'Navigation result failed: {error}')

	def cancel(self, _message):
		# Invalidate a goal that has been sent but not yet accepted as well.
		self.generation += 1
		if self.goal_handle is None:
			self.status('Cancellation pending goal acceptance' if self.pending else 'No active navigation goal')
			return
		try:
			self.goal_handle.cancel_goal_async().add_done_callback(self.cancel_response)
			self.status('Navigation cancellation requested')
		except Exception as error:
			self.status(f'Cancellation failed: {error}')

	def cancel_response(self, future):
		try:
			if not future.result().goals_canceling:
				self.status('Nav2 did not accept cancellation; check the robot')
		except Exception as error:
			self.status(f'Cancellation response failed: {error}')

	def emergency_stop(self, message):
		self.estopped = message.data
		if self.estopped:
			self.cancel(None)


def main():
	rclpy.init()
	node = RedbrickNavigationGateway()
	try:
		rclpy.spin(node)
	finally:
		node.destroy_node()
		rclpy.shutdown()


if __name__ == '__main__':
	main()
