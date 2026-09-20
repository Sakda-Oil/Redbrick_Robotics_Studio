# Redbrick Robotics Studio Architecture

Redbrick Robotics Studio is a Code - OSS distribution for Arduino development. The project keeps the upstream workbench and Electron packaging architecture intact, while Redbrick-specific behavior lives in isolated extensions and build assets.

## Principles

- Track Code - OSS closely; avoid invasive changes to upstream editor internals.
- Treat `Icon.png` at the repository root as the immutable branding master.
- Generate platform-specific application assets from the master; never hand-edit derived icons.
- Add Arduino capability through a built-in extension and small, testable service modules.
- Reuse the standard Arduino sketchbook and Arduino15 data locations whenever Arduino CLI supports them.

## Repository layout

- `src/` — upstream Code - OSS workbench and platform code.
- `extensions/` — upstream built-in extensions plus the Redbrick Arduino extension.
- `resources/` — product branding and generated platform assets.
- `scripts/` — upstream build tooling plus Redbrick asset-generation scripts.
- `build/` — upstream desktop packaging configuration.
- `docs/` — Redbrick architecture and integration documentation.

## Product identity

- Product name: Redbrick Robotics Studio
- Company: Redbrick Robotics Co., Ltd.
- Application identifier: `com.redbrickrobotics.studio`
- Linux application name: `redbrick-robotics-studio`
- Windows executable base name: `Redbrick Robotics Studio`

## Arduino module boundary

The future built-in extension owns commands and UI for projects, boards, ports, build/upload, packages, libraries, examples, serial tools, and C++ language integration. A CLI adapter will be the only layer that invokes Arduino CLI. Configuration and discovery will prefer Arduino's standard directories and will not create a separate package ecosystem.

## Phases

Phase 1 establishes a buildable, launchable branded Code - OSS distribution and generated icons. Later phases add Arduino functionality without coupling it to upstream workbench internals.
