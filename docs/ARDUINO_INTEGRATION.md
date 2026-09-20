# Arduino Integration

## Goal

Provide a first-class Arduino workflow through a built-in Redbrick extension while retaining compatibility with Arduino IDE and Arduino CLI.

## Standard storage

On Windows, default discovery will use the user's conventional locations:

- Sketchbook: `%USERPROFILE%\Documents\Arduino`
- Boards, tools, and package indexes: `%LOCALAPPDATA%\Arduino15`

Equivalent Arduino-standard locations will be used on macOS and Linux. Paths reported by `arduino-cli config dump` take precedence over assumptions, and explicit user configuration takes precedence over detected defaults.

## Implemented foundation

- `cli` — executable discovery, version checks, process execution, cancellation, JSON parsing, and an observable output channel.
- `projects` — sketch discovery, creation, opening, and installed-library examples.
- `boards` — FQBN selection plus package-index update and platform installation commands.
- `ports` — serial discovery and automatic board association when Arduino CLI reports one unambiguous match.
- `build` — verify, compile, and upload commands.
- `libraries` — library-index update and installation by exact library name.
- `serial` — Arduino CLI Serial Monitor in an Output channel with baud-rate selection, timestamps, and an explicit close command.

Version 0.4.2 exposes an Arduino Activity Bar icon and an editor toolbar shortcut. The Arduino view includes New Project, Initialize Current Folder, searchable Board Configuration, Board Manager, Library Manager, Additional Board Manager URLs, Verify, Upload, Examples, serial commands, and IntelliSense generation. Board Configuration reads board-specific options from Arduino CLI and preserves them in the selected FQBN.

Board names, FQBNs, dynamic options, connected ports, and matching boards come from the active Arduino CLI rather than a private board database. ESP32 NodeMCU / ESP-WROOM-32 users can select the installed `NodeMCU-32S` definition (`esp32:esp32:nodemcu-32s`), which supplies `LED_BUILTIN`. Upload refreshes ports, excludes Bluetooth virtual COM ports from upload choices on Windows, reports a busy port clearly, and offers a BOOT-button retry at 115200 after an ESP32 connection failure.

Arduino sketches use a C++-based TextMate grammar with Arduino function and constant scopes, so `.ino` and `.pde` files receive syntax highlighting without requiring a Marketplace extension. Examples are grouped into Arduino built-in categories and libraries compatible with the selected FQBN. Selecting an example opens an editable working document immediately; its source under Arduino IDE or Arduino15 is never modified. The first Save asks where to create a new sketch folder, copies all companion files, and adds Redbrick project configuration.

The Redbrick Dark theme is a default contribution, not a forced user setting. Change it through Preferences: Color Theme. An existing explicitly selected theme remains unchanged.

## Build and upload behavior

- Verify builds the sketch; Upload builds and then uploads.
- CLI Upload skips compilation and requires a successful Verify with the same board configuration. It intentionally uploads the last compiled code, not subsequent unsaved edits.
- Programmer upload commands ask for a programmer provided by the selected core.
- Build artifacts use a per-sketch hashed directory under the system temporary directory. This avoids AVR compiler failures caused by Thai characters in the build path on this Windows machine. Board packages and libraries remain in Arduino-standard locations.
- Rebuild IntelliSense Configuration generates compile_commands.json using Arduino CLI, asks before replacing an existing file, and configures C/C++ compileCommands when that extension is installed. A separate language-service extension is still required for completion/diagnostics.
- Serial Plotter, serial text input, and complete Community Edition feature parity are not yet implemented. Hardware upload and external programmers require device-level validation.

## Validation on 2026-09-14

Targeted extension compilation passed with zero TypeScript errors. In an isolated portable-build profile, the Arduino icon opened the tools, Initialize created and opened Sketch.ino, Redbrick default colors were active, and ESP32 CPU frequency could be changed to 160 MHz. Arduino Uno Verify succeeded for a sketch under a Thai-language workspace path (444 bytes Flash, 9 bytes RAM).

IntelliSense generation also succeeded through the UI and produced a 30,990-byte compilation database. This validates generation, not the accuracy of a separately installed C++ language server.

The updated extension is deployed in the sibling VSCode-win32-x64 portable directory. The older setup executable has not been regenerated for these 0.4.2 changes. Save your files, close the old window, and launch `D:\Desktop\Redbrick\VSCode-win32-x64\Redbrick Robotics Studio.exe`. In a trusted workspace, click the Redbrick Arduino Activity Bar icon; use New Arduino Project for a new sketch folder or Initialize Current Folder for an existing empty folder.

## Commands

Open the Command Palette and run a command whose name starts with `Redbrick Arduino:`. The normal workflow is:

1. Create or open a sketch.
2. Select a board from the left side of the status bar.
3. Select a serial port when uploading or monitoring.
4. Run Verify, Compile and Upload, or Open Serial Monitor.

If Arduino CLI cannot be detected automatically, set `redbrickArduino.cli.path` to its executable path in Settings.

## Compatibility rules

- Do not copy or fork installed cores and libraries into Redbrick-specific storage.
- Do not modify Arduino CLI global configuration without an explicit user action.
- Keep command execution observable and cancellable.
- Preserve upstream Code - OSS extension-host isolation.
