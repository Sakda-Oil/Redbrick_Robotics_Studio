# Redbrick Robotics Studio

Redbrick Robotics Studio is an Arduino and robotics development environment from Redbrick Robotics Co., Ltd. It is built as a branded distribution of the MIT-licensed Code - OSS source tree.

Phase 1 provides the cross-platform desktop application foundation, Redbrick product identity, generated application icons, Windows production package and installer, and a built-in Redbrick Arduino extension foundation.

## Documentation

- [คู่มือพัฒนา แก้ไข Build และย้ายเครื่อง (Windows/macOS/Linux)](docs/MANUAL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Arduino integration](docs/ARDUINO_INTEGRATION.md)
- [Implementation tasks](TASKS.md)

## Requirements

- Node.js `24.18.0` (the version in `.nvmrc`)
- npm
- Platform build prerequisites required by Code - OSS
- On Windows: Visual Studio 2022 Build Tools with the Desktop development with C++ workload, Spectre-mitigated libraries, and Windows 11 SDK signing tools

## Develop

```powershell
$nodeDir = Join-Path $PWD '.build\toolchain\node-v24.18.0-win-x64'
$env:PATH = "$nodeDir;$env:PATH"
npm.cmd install
npm.cmd run generate-icons
npm.cmd run compile
.\scripts\code.bat
```

`Icon.png` in the repository root is the immutable branding master. Run `npm run generate-icons` after checking out the project or whenever generated platform assets need to be refreshed. Run `npm run verify-branding` to validate product identity and generated Windows, macOS, and Linux icon assets.

Using `npm.cmd` avoids PowerShell execution-policy errors caused by the `npm.ps1` shim.

## Arduino workflow

Open the Command Palette with `Ctrl+Shift+P`, type `Redbrick Arduino`, and then:

1. Run `Redbrick Arduino: New Arduino Project` or `Open Arduino Project`.
2. Choose the board and port from the status bar.
3. Run `Verify`, `Compile and Upload`, or `Open Serial Monitor`.

The built-in extension automatically discovers Arduino CLI from Arduino IDE installations and uses the same Arduino sketchbook, core, board-package, and library locations. The CLI executable can be overridden with the `redbrickArduino.cli.path` setting.

## Package on Windows

Run these commands in a Visual Studio Developer PowerShell with the Windows SDK `x64` tools directory on `PATH`:

```powershell
npm run gulp vscode-win32-x64
npm run gulp vscode-win32-x64-inno-updater
npm run gulp vscode-win32-x64-user-setup
```

The production application is emitted beside the repository in `VSCode-win32-x64`; the user installer is emitted to `.build/win32-x64/user-setup/RedbrickRoboticsStudioSetup.exe`.

## Upstream and license

The Redbrick source repository is [Sakda-Oil/Redbrick_Robotics_Studio](https://github.com/Sakda-Oil/Redbrick_Robotics_Studio). The editor foundation is sourced from Microsoft's [Code - OSS repository](https://github.com/microsoft/vscode). Upstream source and Redbrick modifications remain available under the [MIT license](LICENSE.txt). Visual Studio Code is Microsoft's separately licensed distribution of Code - OSS; its product identity and artwork are not used as the Redbrick application identity.
