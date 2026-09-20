# คู่มือพัฒนา แก้ไข Build และย้ายเครื่อง

# Redbrick Robotics Studio

เอกสารนี้เป็นคู่มือสำหรับนักพัฒนาที่ต้องการ clone โปรเจกต์ไปพัฒนา ทดสอบ และสร้างแพ็กเกจบน Windows, macOS หรือ Linux โปรเจกต์นี้เป็น Code - OSS distribution ของ Redbrick Robotics Co., Ltd. และมี `redbrick-arduino` เป็น built-in extension สำหรับงาน Arduino/ESP32

> ข้อสำคัญ: แต่ละระบบต้อง build แพ็กเกจของระบบนั้นบนเครื่องระบบเดียวกัน โดยเฉพาะ `.app`/`.dmg` ของ macOS และ installer ของ Windows ไม่ควร cross-compile จากอีกระบบ

## 1. Repository และ branch

```text
Repository: https://github.com/Sakda-Oil/Redbrick_Robotics_Studio.git
Development branch: main
Upstream Code - OSS: https://github.com/microsoft/vscode.git
```

Clone ลง path ที่ไม่มีช่องว่างและไม่ซ้อนลึกเกินไป เพราะ native build tools บางตัวมีข้อจำกัดเรื่อง path:

```bash
git clone https://github.com/Sakda-Oil/Redbrick_Robotics_Studio.git
cd Redbrick_Robotics_Studio
git remote -v
```

ควรเห็น `origin` เป็น repository ของ Redbrick และ `upstream` เป็น Code - OSS ถ้าไม่มี upstream ให้เพิ่มด้วย:

```bash
git remote add upstream https://github.com/microsoft/vscode.git
```

## 2. โครงสร้างที่ต้องรู้ก่อนแก้ไข

```text
Redbrick_Robotics_Studio/
├── Icon.png                         master icon ห้ามแก้ artwork ต้นฉบับ
├── product.json                     ชื่อโปรแกรม, App ID, bundle ID, gallery
├── package.json                     เวอร์ชัน, dependencies และ build scripts
├── extensions/redbrick-arduino/     Arduino built-in extension
│   ├── package.json                 commands, settings, theme, language
│   ├── src/                         TypeScript implementation
│   ├── syntaxes/                    syntax highlighting ของ .ino/.pde
│   ├── themes/                      Redbrick Dark
│   └── test/                        unit tests
├── resources/
│   ├── branding/icon.png            สำเนาที่ตรวจ hash กับ Icon.png
│   ├── win32/                       .ico และ installer artwork
│   ├── darwin/code.icns             macOS bundle icon
│   └── linux/                       desktop entries และ hicolor icons
├── scripts/
│   ├── generate-icons.mjs           สร้าง asset ทุกแพลตฟอร์มจาก Icon.png
│   └── verify-branding.mjs          ตรวจ identity และ icon outputs
├── build/                            Code - OSS packaging tasks
├── src/                              Code - OSS workbench/core
└── docs/                             architecture, roadmap และคู่มือ
```

หลักการแก้ไขคือเก็บความสามารถ Arduino ไว้ใน `extensions/redbrick-arduino` ให้มากที่สุด เพื่อลด conflict เมื่อต้องรับ upstream ใหม่ ส่วน `src/`, `build/`, `resources/` และ `product.json` แก้เฉพาะ integration/branding ที่จำเป็น

## 3. Product identity ที่ต้องคงไว้

ค่าหลักอยู่ใน `product.json`:

| รายการ | ค่า |
|---|---|
| Product name | `Redbrick Robotics Studio` |
| Company | `Redbrick Robotics Co., Ltd.` |
| Application name | `redbrick-robotics-studio` |
| macOS bundle ID | `com.redbrickrobotics.studio` |
| Linux icon name | `redbrick-robotics-studio` |
| Windows AppUserModelID | `RedbrickRobotics.Studio` |

หลังแก้ branding ให้รัน:

```bash
npm run verify-branding
```

`Icon.png` ที่ root เป็น master icon เพียงไฟล์เดียว สคริปต์จะอ่านไฟล์นี้โดยไม่แก้ artwork แล้วสร้าง `.ico`, `.icns`, Linux PNG, workbench icon, extension icon และ Inno Setup artwork:

```bash
npm run generate-icons
npm run verify-branding
```

ห้ามแก้ไฟล์ generated icon รายตัว เพราะครั้งถัดไปที่รัน `generate-icons` จะถูกเขียนทับ

## 4. Prerequisites ร่วมทุกระบบ

- Git
- Node.js เวอร์ชันตรงกับ `.nvmrc` ปัจจุบันคือ `24.18.0`
- npm ที่มากับ Node.js
- Python 3 สำหรับ `node-gyp`; บน Python รุ่นใหม่อาจต้องติดตั้ง `setuptools`
- RAM อย่างน้อย 8 GB; แนะนำ 16 GB ขึ้นไป
- พื้นที่ว่างอย่างน้อย 20 GB สำหรับ source, `node_modules`, Electron และ package outputs
- Internet สำหรับครั้งแรกที่ติดตั้ง dependencies และดาวน์โหลด Electron/built-in assets

ตรวจเวอร์ชันก่อนทุกครั้ง:

```bash
node --version
npm --version
python --version
git --version
```

`node --version` ต้องเป็น `v24.18.0` หากใช้ `nvm`/`nvm-windows` ให้เลือกจาก `.nvmrc` ก่อน `npm install`

## 5. เตรียมเครื่อง Windows

ติดตั้ง:

1. Git for Windows
2. Node.js `24.18.0` x64 หรือ arm64 ให้ตรงกับเครื่อง
3. Python 3
4. Visual Studio 2022 Build Tools พร้อม workload **Desktop development with C++**
5. MSVC toolset, Windows 10/11 SDK และ Spectre-mitigated libraries ที่ตรงกับ architecture

เปิด **Developer PowerShell for VS 2022** แล้ว clone repository แนะนำ path เช่น `D:\Redbrick\IDE`

PowerShell บางเครื่องห้ามรัน `npm.ps1` ให้ใช้ `npm.cmd` ทุกคำสั่ง ไม่จำเป็นต้องลด Execution Policy:

```powershell
cd D:\Redbrick\IDE
node --version
npm.cmd install
```

ถ้า repository มี Node แบบ portable ใน `.build\toolchain` สามารถใช้ชั่วคราวได้ แต่ไม่ควรอ้าง path ของผู้พัฒนาคนเดิม:

```powershell
$nodeDir = Join-Path $PWD '.build\toolchain\node-v24.18.0-win-x64'
$env:PATH = "$nodeDir;$env:PATH"
node --version
```

## 6. เตรียมเครื่อง macOS

ติดตั้ง Xcode Command Line Tools, Node.js ตาม `.nvmrc` และ Python 3:

```bash
xcode-select --install
nvm install 24.18.0
nvm use 24.18.0
python3 --version
npm install
```

Build บน Apple Silicon ใช้ `arm64`; Intel Mac ใช้ `x64` ตรวจด้วย:

```bash
uname -m
```

การแจกจ่ายภายนอกองค์กรควรมี Apple Developer ID, code signing และ notarization หากไม่มี ลองเปิด unsigned development `.app` ได้เฉพาะการทดสอบภายในตามนโยบาย Gatekeeper ของเครื่องนั้น

## 7. เตรียมเครื่อง Linux

ตัวอย่าง Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev python-is-python3 pkg-config git
nvm install 24.18.0
nvm use 24.18.0
npm install
```

ถ้าจะสร้าง `.deb`/`.rpm` เพิ่มเครื่องมือ packaging:

```bash
sudo apt-get install -y fakeroot rpm
```

Linux `x64`, `arm64` และ `armhf` ต้องใช้ task ให้ตรงกับ architecture ของเครื่อง/target และ native dependencies ที่รองรับ architecture นั้น

## 8. ติดตั้ง dependencies แบบทำซ้ำได้

หลัง clone ใหม่ให้เริ่มด้วย:

```bash
npm install
npm run generate-icons
npm run verify-branding
```

โปรเจกต์ Code - OSS มี postinstall หลายชุดและ native modules จึงใช้เวลานานได้ หากเปลี่ยน Node major version ให้กลับมาใช้เวอร์ชันใน `.nvmrc` แล้วติดตั้งใหม่

ใน CI ที่ต้องการยึด lockfile ใช้ `npm ci` ได้ แต่หาก upstream script ต้องปรับ dependency ตาม platform ให้ตรวจ log และใช้ `npm install` ตาม workflow ของ Code - OSS รุ่นนี้

## 9. วิธีแก้ Arduino extension

ไฟล์หลัก:

- `src/extension.ts`: activation และ registration
- `src/arduinoController.ts`: command orchestration, Verify, Upload, status bar
- `src/cli/arduinoCli.ts`: เรียก Arduino CLI และ parse output
- `src/boardSelector.ts`, `src/boardModel.ts`: ค้นหา/เลือกบอร์ดและ FQBN options
- `src/arduinoManager.ts`: Board Manager, Library Manager, additional URLs
- `src/serialMonitorPanel.ts`: Serial Monitor webview และ lifecycle ของพอร์ต
- `src/arduinoCompletionProvider.ts`: Arduino suggestions/signature help
- `src/arduinoDefinitionProvider.ts`: Ctrl+Click/F12 ไปยัง declaration/definition
- `src/workspace/`: สร้าง project, config, IntelliSense และเปิด Examples แบบสำเนา

หลังแก้ TypeScript ให้ทำสามขั้นตอน:

```bash
npm run gulp compile-extension:redbrick-arduino
npm --prefix extensions/redbrick-arduino test
npm run compile
```

ผล unit test ปัจจุบันต้องผ่าน 11 รายการ ถ้ามีการเพิ่ม behavior ให้เพิ่ม test ใน `extensions/redbrick-arduino/test/`

การเพิ่ม command ใหม่ต้องทำครบทั้ง registration ใน TypeScript, `contributes.commands`/menus ใน `extensions/redbrick-arduino/package.json` และข้อความ localization ใน `package.nls*.json` ถ้ามีข้อความที่ผู้ใช้เห็น

## 10. Development build และการเปิดโปรแกรม

Build ครั้งเดียว:

```bash
npm run compile
```

Windows:

```powershell
.\scripts\code.bat
```

macOS/Linux:

```bash
./scripts/code.sh
```

โหมดพัฒนาต่อเนื่อง เปิด terminal แรก:

```bash
npm run watch
```

รอจนทุก watcher พร้อม แล้วเปิดอีก terminal เพื่อรัน `scripts/code.bat` หรือ `scripts/code.sh` อย่าเปิด development instance จาก packaged output เพราะจะไม่สะท้อน source ล่าสุด

## 11. Test checklist ก่อน package

```bash
npm run verify-branding
npm run gulp compile-extension:redbrick-arduino
npm --prefix extensions/redbrick-arduino test
npm run compile
git diff --check
```

จาก development instance ทดสอบอย่างน้อย:

1. About แสดงชื่อ Redbrick Robotics Studio
2. ไอคอนหน้าต่าง/taskbar/Dock ถูกต้อง
3. New Arduino Project สร้าง `.ino` และ config
4. Board selector พิมพ์ค้นหาได้
5. Port selector เห็น USB serial port
6. Verify ผ่านกับ Arduino Uno หรือ ESP32 ที่ติดตั้ง core แล้ว
7. Upload ปิด Serial Monitor ก่อนใช้พอร์ต และเปิดใหม่ได้หลัง upload
8. Serial Monitor เลือก port/baud/line ending และรับส่งข้อความได้
9. `.ino` มี syntax colors, suggestions และ signature help
10. Ctrl+Click/F12 ไปยัง Arduino core/library definition ได้
11. Examples เปิดเป็น working copy และ Save ครั้งแรกถามตำแหน่งใหม่

## 12. สร้าง Windows portable และ installer

ให้รันใน Windows Developer PowerShell และใช้ `npm.cmd` หากติด Execution Policy

วิธีแนะนำสำหรับเครื่องปัจจุบันและเครื่องพัฒนาเครื่องอื่นคือใช้สคริปต์ซึ่งตรวจ Node.js ตาม `.nvmrc` และค้นหา Windows SDK `signtool.exe` อัตโนมัติ:

```powershell
cd D:\Redbrick\IDE
npm.cmd install
.\scripts\build-windows.ps1
```

คำสั่งเดียวจะสร้างทั้ง portable x64 และ user installer หากต้องการเฉพาะ portable:

```powershell
.\scripts\build-windows.ps1 -Installer none
```

สำหรับ Windows ARM64:

```powershell
.\scripts\build-windows.ps1 -Architecture arm64
```

โฟลเดอร์ติดตั้งแบบ user ใช้ path สั้น `%LOCALAPPDATA%\Redbrick` เพื่อไม่ให้ dependency paths ที่ซ้อนลึกและชื่อไฟล์ชั่วคราวของ installer เกินข้อจำกัดของ Windows ขณะที่ชื่อใน Start Menu, shortcut, About และชื่อ executable ยังคงเป็น `Redbrick Robotics Studio`

### Windows x64 portable

```powershell
npm.cmd run gulp vscode-win32-x64
```

ผลลัพธ์อยู่ข้าง repository:

```text
..\VSCode-win32-x64\Redbrick Robotics Studio.exe
```

### Windows arm64 portable

```powershell
npm.cmd run gulp vscode-win32-arm64
```

### Installer แบบติดตั้งเฉพาะผู้ใช้

ต้องสร้าง portable และใส่ไอคอนให้ Inno updater ก่อน:

```powershell
npm.cmd run gulp vscode-win32-x64
npm.cmd run gulp vscode-win32-x64-inno-updater
npm.cmd run gulp vscode-win32-x64-user-setup
```

ผลลัพธ์:

```text
.build\win32-x64\user-setup\RedbrickRoboticsStudioSetup.exe
```

### Installer แบบติดตั้งทั้งเครื่อง

```powershell
npm.cmd run gulp vscode-win32-x64
npm.cmd run gulp vscode-win32-x64-inno-updater
npm.cmd run gulp vscode-win32-x64-system-setup
```

ผลลัพธ์:

```text
.build\win32-x64\system-setup\RedbrickRoboticsStudioSetup.exe
```

ก่อนแจกจริงให้ sign executable/installer ด้วย certificate ของ Redbrick; `--sign` ต้องใช้ signing environment/credentials ที่องค์กรตั้งค่าไว้

## 13. สร้าง macOS application

Apple Silicon:

```bash
npm run gulp vscode-darwin-arm64
```

Intel:

```bash
npm run gulp vscode-darwin-x64
```

ผลลัพธ์อยู่ข้าง repository:

```text
../VSCode-darwin-arm64/Redbrick Robotics Studio.app
../VSCode-darwin-x64/Redbrick Robotics Studio.app
```

ตรวจ bundle:

```bash
plutil -p "../VSCode-darwin-arm64/Redbrick Robotics Studio.app/Contents/Info.plist"
codesign --verify --deep --strict "../VSCode-darwin-arm64/Redbrick Robotics Studio.app"
```

สำหรับ release สาธารณะให้ทำ code signing, hardened runtime, notarization และ DMG บน macOS ด้วย certificate ของ Redbrick ขั้นตอน CI upstream สำหรับ DMG อยู่ใน `build/azure-pipelines/darwin/`; อย่าแจก unsigned DMG เป็น production

## 14. สร้าง Linux application และ packages

### Portable directory

```bash
npm run gulp vscode-linux-x64
```

architecture อื่น:

```bash
npm run gulp vscode-linux-arm64
npm run gulp vscode-linux-armhf
```

ผลลัพธ์ตัวอย่าง:

```text
../VSCode-linux-x64/bin/redbrick-robotics-studio
```

### Debian package

```bash
npm run gulp vscode-linux-x64-prepare-deb
npm run gulp vscode-linux-x64-build-deb
```

### RPM package

```bash
npm run gulp vscode-linux-x64-prepare-rpm
npm run gulp vscode-linux-x64-build-rpm
```

package จะใช้ `resources/linux/code.desktop`, URL handler, AppStream metadata และ hicolor icons ชื่อ `redbrick-robotics-studio` ให้ตรวจหลังติดตั้ง:

```bash
grep -E '^(Name|Exec|Icon)=' /usr/share/applications/redbrick-robotics-studio.desktop
find /usr/share/icons/hicolor -path '*apps/redbrick-robotics-studio.png'
```

## 15. การนำไปใช้บนเครื่องผู้ใช้

เครื่องปลายทางไม่ต้องมี Node.js, compiler หรือ source code หากใช้ packaged build แต่สำหรับงาน Arduino ต้องมีอย่างใดอย่างหนึ่ง:

- Arduino IDE 2.x ที่มี Arduino CLI ภายใน หรือ
- `arduino-cli` ใน `PATH` หรือ
- ตั้ง `redbrickArduino.cli.path` ไปยัง executable

Redbrick ใช้ Arduino ecosystem เดิม ไม่สร้าง store แยก:

| ระบบ | Sketchbook โดยทั่วไป | Arduino data/packages โดยทั่วไป |
|---|---|---|
| Windows | `%USERPROFILE%\Documents\Arduino` | `%LOCALAPPDATA%\Arduino15` |
| macOS | `~/Documents/Arduino` | `~/Library/Arduino15` |
| Linux | `~/Arduino` | `~/.arduino15` |

ตำแหน่งจริงอาจเปลี่ยนได้จาก Arduino CLI configuration หรือ OneDrive จึงไม่ควร hard-code user name/path ใน source

## 16. ปัญหาที่พบบ่อย

### PowerShell แจ้งว่า npm.ps1 ถูก block

ใช้ `npm.cmd`:

```powershell
npm.cmd run compile
```

### Native module build ไม่ผ่าน

ตรวจ Node ให้ตรง `.nvmrc`, Python, C++ toolchain และ SDK จากนั้นรัน install ใหม่ อย่าคัดลอก `node_modules` ข้าม OS หรือข้าม CPU architecture

### Arduino CLI ไม่พบ

เปิด Settings แล้วกำหนด `redbrickArduino.cli.path` หรือเพิ่ม `arduino-cli` ใน `PATH`

### USB port ไม่แสดง

ตรวจสาย data, driver ของ USB-UART (เช่น CP210x/CH340), Device Manager/`ls /dev/tty*`, สิทธิ์ `dialout` บน Linux และปิดโปรแกรมอื่นที่จับพอร์ต จากนั้นกด Refresh Serial Ports

### ESP32 upload ไม่ได้

ปิด Serial Monitor, เลือก COM/board/FQBN ให้ถูก ลด upload speed เป็น `115200` และกด BOOT ค้างระหว่าง `Connecting...` หาก pySerial แจ้ง PermissionError ให้ถอดเสียบ USB ใหม่ ตรวจ driver และปิด process ที่จับพอร์ต

### Ctrl+Click หรือ autocomplete ไม่ทำงาน

เปิด workspace ที่ trusted, เลือก board, รัน **Rebuild IntelliSense Configuration**, ตรวจว่า core/library ติดตั้งอยู่ใน Arduino directories แล้ว Reload Window

### Build path มีอักษรไทย/ช่องว่าง

แนะนำ clone source ลง path ASCII ที่สั้น เช่น `D:\Redbrick\IDE` หรือ `~/src/redbrick-ide` ตัว extension ใช้ temp build directory เพื่อช่วย Arduino toolchains แต่ Code - OSS/native packaging บางส่วนยังไวต่อ path

## 17. Git workflow และรับ upstream

ก่อนเริ่มงาน:

```bash
git switch main
git pull --ff-only origin main
git status
```

สร้าง branch สำหรับงานใหม่:

```bash
git switch -c feature/short-description
```

ก่อน commit รัน checklist ในหัวข้อ 11 แล้ว:

```bash
git add <files>
git commit -m "feat: describe the change"
git push -u origin feature/short-description
```

การรับ Code - OSS upstream ควรทำใน branch แยกและแก้ conflict อย่างระมัดระวัง:

```bash
git fetch upstream
git switch -c chore/sync-code-oss
git merge upstream/main
```

หลัง merge ต้องตรวจ branding, generated icons, built-in extension, GitHub authentication, Open VSX search และ package ทุก OS อีกครั้ง ห้าม force-push `main` โดยไม่ตกลงกับทีม

## 18. Release checklist

- [ ] `git status` ไม่มีไฟล์สำคัญตกหล่น
- [ ] Node ตรง `.nvmrc`
- [ ] `npm install`/`npm ci` ผ่านบน clean checkout
- [ ] branding verification ผ่าน
- [ ] extension compile และ 11 tests ผ่าน
- [ ] full compile ผ่าน
- [ ] Windows portable/installer เปิดได้และไอคอนถูกต้อง
- [ ] macOS `.app` เปิดได้ Finder/Dock ใช้ Redbrick icon และผ่าน signing/notarization สำหรับ production
- [ ] Linux launcher/taskbar ใช้ hicolor icon และ desktop entry ถูกต้อง
- [ ] Verify/Upload/Serial Monitor ทดสอบกับ hardware จริง
- [ ] version, changelog และ Git tag ถูกต้อง
- [ ] เก็บ SHA-256 checksum ของ artifacts

เอกสารสถาปัตยกรรมเพิ่มเติมอยู่ที่ `docs/ARCHITECTURE.md` และรายละเอียด Arduino อยู่ที่ `docs/ARDUINO_INTEGRATION.md`
