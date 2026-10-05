#!/usr/bin/env python3
"""Provide a stable topic-to-Nav2 action gateway for ROS 2 Humble and Jazzy."""

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient
from rclpy.node import Node
from std_msgs.msg import Empty


class RedbrickNavigationGateway(Node):
	def __init__(self):
		super().__init__('redbrick_navigation_gateway')
		self.client = ActionClient(self, NavigateToPose, '/navigate_to_pose')
		self.goal_handle = None
		self.create_subscription(PoseStamped, '/redbrick/navigation_goal', self.navigate, 5)
		self.create_subscription(Empty, '/redbrick/cancel_navigation', self.cancel, 5)

	def navigate(self, pose):
		if not self.client.wait_for_server(timeout_sec=1.0):
			self.get_logger().error('Nav2 /navigate_to_pose action server is unavailable')
			return
		if self.goal_handle is not None:
			self.goal_handle.cancel_goal_async()
		goal = NavigateToPose.Goal()
		goal.pose = pose
		future = self.client.send_goal_async(goal, feedback_callback=self.feedback)
		future.add_done_callback(self.goal_response)

	def goal_response(self, future):
		self.goal_handle = future.result()
		if not self.goal_handle or not self.goal_handle.accepted:
			self.goal_handle = None
			self.get_logger().error('Navigation goal was rejected')
			return
		self.get_logger().info('Navigation goal accepted')
		result = self.goal_handle.get_result_async()
		result.add_done_callback(self.goal_result)

	def goal_result(self, future):
		status = future.result().status
		self.get_logger().info(f'Navigation finished with status {status}')
		self.goal_handle = None

	def feedback(self, _message):
		pass

	def cancel(self, _message):
		if self.goal_handle is None:
			self.get_logger().info('No active navigation goal to cancel')
			return
		self.goal_handle.cancel_goal_async()
		self.get_logger().warning('Navigation cancellation requested')


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
