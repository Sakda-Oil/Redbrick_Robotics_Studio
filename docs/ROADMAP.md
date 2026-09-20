# Redbrick Robotics Studio Roadmap

## Phase 1 — Foundation

Status: complete on Windows. Cross-platform assets and native packaging configuration are ready; macOS and Linux native package smoke tests must run on their respective operating systems.

- Import Code - OSS source and initialize project history.
- Apply Redbrick product identity and platform packaging names.
- Generate Windows, macOS, and Linux icons from the root `Icon.png` master.
- Build and launch the desktop development application.

## Phase 2 — Arduino CLI integration

- Detect or provision Arduino CLI.
- Add a typed process adapter, configuration service, diagnostics, and cancellation.
- Reuse the user's Arduino sketchbook and Arduino15 package/data directories.

## Phase 3 — Projects, boards, and ports

- New/Open Arduino Project commands and `.ino` workflow.
- Board selector and port selector in the workbench UI.

## Phase 4 — Verify, compile, and upload

- Task orchestration, output parsing, progress, diagnostics, and upload controls.

## Phase 5 — Board and library management

- Board Manager, Library Manager, package index refresh, examples, and updates.

## Phase 6 — Serial tools

- Serial Monitor and Serial Plotter with safe port ownership and reconnect behavior.

ROS 2, AI, Blockly, and Robot Dashboard are explicitly outside the current roadmap.
