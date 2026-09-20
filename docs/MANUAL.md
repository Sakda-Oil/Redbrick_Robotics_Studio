# คู่มือสถาปัตยกรรม การติดตั้ง การพัฒนา และการ Build โปรเจกต์
# Redbrick Robotics Studio (Code - OSS Distribution)

---

## 1. บทนำและภาพรวมของระบบ (Introduction & Architecture Overview)

**Redbrick Robotics Studio** คือซอฟต์แวร์ IDE สำหรับการพัฒนาหุ่นยนต์และบอร์ดไมโครคอนโทรลเลอร์ (Arduino, ESP32, STM32) ที่พัฒนาขึ้นโดยต่อยอดจากโครงการโอเพนซอร์ส **Code - OSS** (แกนกลางของ Microsoft Visual Studio Code) 

### หลักการออกแบบสำคัญ (Core Architecture Principles)
1. **Upstream Isolation (ไม่แตะต้องระบบแกนกลาง):** รักษาโครงสร้างหลักของ Code - OSS ให้ตรงกับต้นฉบับมากที่สุด โดยฟังก์ชันการทำงานเฉพาะทางของ Redbrick จะอยู่ในรูปของ **Built-in Extension (`extensions/redbrick-arduino`)** และการตั้งค่า Assets/Packaging เท่านั้น เพื่อให้สามารถอัปเดตแกนโปรแกรมตามต้นฉบับได้ง่าย
2. **Single Source of Truth Branding:** ใช้ไฟล์ [`Icon.png`](file:///d:/Desktop/Redbrick/IDE/Icon.png) ที่รากของโปรเจกต์ (Root) เป็นไฟล์ไอคอนต้นแบบเพียงไฟล์เดียว และใช้สคริปต์อัตโนมัติในการแปลงเป็นไอคอนของทุกระบบปฏิบัติการ (Windows `.ico`, macOS `.icns`, Linux `.png`) ห้ามแก้ไขไฟล์ไอคอนปลายทางด้วยมือ
3. **Arduino Standard Reuse:** นำโครงสร้างไดเรกทอรีมาตรฐานของ Arduino CLI และ Arduino IDE กลับมาใช้งานโดยตรง ได้แก่ Sketchbook (`Documents/Arduino` หรือ OneDrive) และ Data/Cores (`%LOCALAPPDATA%\Arduino15`) ไม่สร้างโฟลเดอร์แยกส่วนตัว ทำให้ใช้บอร์ดและไลบรารีร่วมกับ Arduino IDE ได้ทันที 100%

---

## 2. โครงสร้างและหน้าที่ของไฟล์ต่าง ๆ ในโปรเจกต์ (File & Directory Roles)

```
IDE/
├── Icon.png                          # [สำคัญ] ไอคอนต้นแบบความละเอียดสูง (Master Icon)
├── package.json                      # การประกาศชื่อแอปเวอร์ชัน dev, script build, dependencies
├── product.json                      # [สำคัญ] ข้อมูลอัตลักษณ์ (Branding), App ID, ชื่อโปรแกรม, Open VSX Gallery
├── TASKS.md                          # รายการบันทึกสถานะการพัฒนาแต่ละเฟส (Roadmap Checklist)
├── docs/                             # โฟลเดอร์เอกสารประกอบระบบ
│   ├── ARCHITECTURE.md               # สถาปัตยกรรมระบบโดยรวม
│   ├── ARDUINO_INTEGRATION.md        # รายละเอียดการเชื่อมโยงระบบกับ Arduino CLI
│   ├── ROADMAP.md                    # แผนงานในอนาคต
│   └── MANUAL.md                     # [เอกสารนี้] คู่มือการทำงาน การติดตั้ง การแก้ไข และการ Build
├── build/                            # สคริปต์และเครื่องมือสำหรับ Build ระบบของ VS Code
│   ├── gulpfile.extensions.ts        # ลงทะเบียน extension redbrick-arduino เข้ากระบวนการ compile ร่วม
│   ├── gulpfile.vscode.win32.ts      # สคริปต์การแพ็กเกจสำหรับ Windows (Portable & Installer)
│   ├── gulpfile.vscode.linux.ts      # สคริปต์การแพ็กเกจสำหรับ Linux
│   ├── lib/electron.ts               # กำหนดค่า Electron framework
│   └── win32/code.iss                # สคริปต์ Inno Setup สำหรับสร้างตัวติดตั้ง Windows Setup (.exe)
├── extensions/
│   └── redbrick-arduino/             # [สำคัญ] ซอร์สโค้ด Built-in Extension ควบคุมระบบ Arduino
│       ├── package.json              # กำหนด commands, menus, shortcuts, grammars, themes
│       ├── language-configuration.json # กฎของภาษา Arduino (.ino / .pde)
│       ├── syntaxes/                 # TextMate Grammar ให้ไฮไลต์โค้ด Arduino ฟังก์ชันและค่าคงที่
│       ├── themes/redbrick-dark.json # ธีมสีเฉพาะ Redbrick Dark
│       ├── test/                     # ชุดทดสอบ Unit Tests
│       │   ├── boardModel.test.cjs   # ทดสอบการ Parse FQBN และจัดการออปชันของบอร์ด
│       │   └── workflow.test.cjs     # ทดสอบขั้นตอนการทำงาน กรองพอร์ต COM และคำสั่งต่างๆ
│       └── src/                      # ซอร์สโค้ดภาษา TypeScript
│           ├── extension.ts          # จุดเริ่มต้นการทำงาน (Entry Point)
│           ├── arduinoController.ts  # ตัวควบคุมหลัก (Status Bar, Verify, Upload, Serial Monitor)
│           ├── arduinoState.ts       # จัดการสถานะ พอร์ตที่เลือก บอร์ดที่เลือก และการรีเฟรช
│           ├── arduinoTypes.ts       # Interface และ Data Types
│           ├── boardModel.ts         # จัดการบอร์ด แยก/รวมค่า FQBN และ Option ต่างๆ
│           ├── boardSelector.ts      # ระบบค้นหาและเลือกบอร์ดแบบ QuickPick
│           ├── arduinoManager.ts     # จัดการ Core, Library, และ Board Manager URL
│           ├── arduinoActions.ts     # TreeDataProvider สำหรับ Activity Bar ด้านซ้าย
│           ├── serialMonitorPanel.ts # Webview Panel หน้าต่าง Serial Monitor แบบ Interactive
│           ├── cli/
│           │   └── arduinoCli.ts     # ติดต่อสั่งการ arduino-cli.exe แปลงผลลัพธ์ JSON และ stream log
│           ├── platform/
│           │   └── arduinoPaths.ts   # ตรวจหาโฟลเดอร์ Sketchbook และ Arduino15 (รองรับ OneDrive)
│           └── workspace/
│               ├── arduinoWorkspace.ts      # สร้างโปรเจกต์ใหม่ และเปิดโฟลเดอร์ Sketch
│               ├── projectConfiguration.ts # จัดการไฟล์ .vscode/arduino.json และ c_cpp_properties.json
│               └── exampleDocuments.ts     # จัดการเปิดไฟล์ตัวอย่าง (Examples) จากไลบรารี
├── resources/                        # ทรัพยากรด้านภาพและ Branding ที่ถูกแปลงแล้ว
│   ├── win32/                        # code.ico และรูปภาพสำหรับ Inno Setup Installer
│   ├── darwin/                       # code.icns สำหรับ macOS
│   └── linux/                        # code.png และ hicolor icons ขนาดต่างๆ สำหรับ Linux
├── scripts/                          # สคริปต์ช่วยเหลือสำหรับนักพัฒนา
│   ├── generate-icons.mjs            # สคริปต์เจนไอคอนทุกขนาดจาก Icon.png
│   ├── verify-branding.mjs           # สคริปต์ตรวจเช็คความถูกต้องของไอคอนและ product.json
│   ├── code.bat / code.sh            # สคริปต์สำหรับรัน IDE ใน Development Mode
│   └── icon-tools/                   # โมดูลภายนอกที่ใช้ประมวลผลรูปภาพ (Sharp)
└── src/                              # ซอร์สโค้ดของ VS Code Workbench (Upstream)
    ├── main.ts                       # จุดเริ่มทำงานของ Electron Main Process (ปรับชื่อ UserData)
    └── vs/base/common/product.ts     # เพิ่มฟิลด์ companyName และ copyright ใน interface
```

---

## 3. สิ่งที่ติดตั้งในระบบและสิ่งที่ต้องเตรียม (Prerequisites & Installed Tools)

### 3.1 สิ่งที่เครื่องสำหรับพัฒนาและ Build ต้องมี
1. **Node.js (Toolchain):**
   * VS Code ต้องการ Node.js เวอร์ชันเฉพาะตามไฟล์ `.nvmrc` คือ **Node.js 24.18.0**
   * ภายในโปรเจกต์มีตัว Toolchain แบบพกพาติดตั้งไว้แล้วที่:
     `d:\Desktop\Redbrick\IDE\.build\toolchain\node-v24.18.0-win-x64\node.exe`
2. **Visual Studio 2022 Build Tools (บน Windows):**
   * ติดตั้ง Workload: **Desktop development with C++**
   * ต้องมีคอมโพเนนต์: MSVC Compiler, Spectre-mitigated libraries, และ Windows 11 SDK
3. **Git for Windows & Git LFS:** สำหรับจัดการโค้ดและดึงข้อมูลไฟล์ขนาดใหญ่
4. **Arduino CLI / Arduino IDE:**
   * ตรวจพบที่: `C:\Users\sakda\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`
   * สามารถเรียกใช้งานได้ทันทีโดยไม่ต้องตั้งค่าใน PATH เพราะระบบจะค้นหาตำแหน่งนี้ให้อัตโนมัติ
5. **Cores & Libraries ที่รองรับในปัจจุบัน:**
   * `arduino:avr` (Arduino Uno, Nano, Mega)
   * `esp32:esp32` (ESP32 Dev Module, NodeMCU-32S)
   * `stm32duino:STM32F1` / `STMicroelectronics:stm32` (STM32 BluePill ฯลฯ)
   * `FRIENDROBOT_AVR:avr`

---

## 4. วิธีแก้ไขและพัฒนาต่อ (Development & Modification Guide)

### 4.1 การตั้งค่า Environment ก่อนทำงาน
เปิด PowerShell แล้วรันคำสั่งเพื่อใช้งาน Node.js v24.18.0 ของโปรเจกต์:
```powershell
cd d:\Desktop\Redbrick\IDE
$nodeDir = Join-Path $PWD '.build\toolchain\node-v24.18.0-win-x64'
$env:PATH = "$nodeDir;$env:PATH"
```

### 4.2 การแก้ไขส่วนขยาย Arduino (`extensions/redbrick-arduino`)
เมื่อมีการแก้ไขไฟล์ TypeScript ในโฟลเดอร์ `extensions/redbrick-arduino/src/`:
1. **ตรวจสอบความถูกต้องของประเภทข้อมูล (Type Check):**
   ```powershell
   & "d:\Desktop\Redbrick\IDE\node_modules\.bin\tsc.cmd" -p d:\Desktop\Redbrick\IDE\extensions\redbrick-arduino\tsconfig.json --noEmit
   ```
2. **รันชุดทดสอบ Unit Tests:**
   ```powershell
   cd extensions/redbrick-arduino
   npm test
   cd ../..
   ```
   *(ต้องผ่านทั้ง 9 การทดสอบ)*
3. **คอมไพล์ Extension:**
   ```powershell
   npm run gulp compile-extension:redbrick-arduino
   ```

### 4.3 การเปลี่ยนโลโก้และไอคอนแอปพลิเคชัน
1. นำไฟล์ภาพโลโก้ใหม่ขนาดสี่เหลี่ยมจัตุรัส (แนะนำขนาด 1024x1024 px ขึ้นไป นามสกุล `.png`) มาบันทึกทับไฟล์ [`Icon.png`](file:///d:/Desktop/Redbrick/IDE/Icon.png) ที่รากของโปรเจกต์
2. รันคำสั่งสร้างไอคอนทุกระบบปฏิบัติการโดยอัตโนมัติ:
   ```powershell
   npm run generate-icons
   ```
3. รันคำสั่งตรวจสอบความถูกต้องของไอคอน:
   ```powershell
   npm run verify-branding
   ```

### 4.4 การเปิดทดสอบโปรแกรมในโหมดพัฒนา (Development Run)
สามารถสั่งเปิดหน้าต่าง Editor ขึ้นมาทดสอบการทำงานได้ทันทีด้วยคำสั่ง:
```powershell
.\scripts\code.bat
```

---

## 5. วิธีการ Build เพื่อนำไปใช้งานบนเครื่องอื่น (Build & Distribution Guide)

มี 2 รูปแบบหลักในการนำโปรแกรมไปใช้งานบนเครื่องอื่น:

### วิธีที่ 1: Build เป็นแบบพกพา ไม่ต้องติดตั้ง (Portable Package) - แนะนำ
วิธีนี้จะได้โฟลเดอร์ที่มีไฟล์โปรแกรมครบถ้วน สามารถนำไปบีบอัดเป็น `.zip` แล้วนำไปเปิดใช้งานบนเครื่องอื่นได้ทันทีโดยไม่ต้องติดตั้ง

1. **เปิด PowerShell แล้วกำหนด PATH ให้ใช้ Node v24:**
   ```powershell
   cd d:\Desktop\Redbrick\IDE
   $nodeDir = Join-Path $PWD '.build\toolchain\node-v24.18.0-win-x64'
   $env:PATH = "$nodeDir;$env:PATH"
   ```
2. **สั่ง Build โปรแกรมสำหรับ Windows 64-bit:**
   ```powershell
   npm run gulp vscode-win32-x64
   ```
3. **ผลลัพธ์:**
   * โปรแกรมจะถูกสร้างออกมาที่โฟลเดอร์:
     [`d:\Desktop\Redbrick\VSCode-win32-x64`](file:///d:/Desktop/Redbrick/VSCode-win32-x64)
   * ภายในจะมีไฟล์เรียกใช้งานชื่อ:
     **`Redbrick Robotics Studio.exe`**
4. **การนำไปแจกจ่าย / ใช้งานเครื่องอื่น:**
   * คลิกขวาที่โฟลเดอร์ `VSCode-win32-x64` แล้วเลือก **Compress to ZIP file**
   * ส่งไฟล์ `.zip` ไปยังเครื่องปลายทาง แตกไฟล์ และดับเบิลคลิก `Redbrick Robotics Studio.exe` ใช้งานได้ทันที

---

### วิธีที่ 2: Build เป็นไฟล์ติดตั้ง Windows Setup (`.exe`)
วิธีนี้จะสร้างไฟล์ติดตั้งตัวเดียว ผู้ใช้สามารถดับเบิลคลิกเพื่อลงโปรแกรมลงในระบบ Windows ได้

1. **เตรียมเครื่องมือเพิ่มเติม:**
   * ตรวจสอบว่าในเครื่องมี Inno Setup 6 ติดตั้งอยู่
2. **รันคำสั่ง Build ตัวติดตั้ง:**
   ```powershell
   npm run gulp vscode-win32-x64
   npm run gulp vscode-win32-x64-inno-updater
   npm run gulp vscode-win32-x64-user-setup
   ```
3. **ผลลัพธ์:**
   * ไฟล์ติดตั้งจะอยู่ที่:
     `d:\Desktop\Redbrick\IDE\.build\win32-x64\user-setup\RedbrickRoboticsStudioSetup.exe`
   * สามารถส่งไฟล์ `.exe` นี้ไปให้เครื่องอื่นติดตั้งได้ทันที

---

### 5.1 สิ่งที่เครื่องปลายทาง (Target Machine) ต้องมี เพื่อใช้งาน
เครื่องปลายทางของผู้ใช้ทั่วไป **ไม่จำเป็นต้องติดตั้ง Node.js หรือ Visual Studio Build Tools ใดๆ** ทั้งสิ้น
ต้องการเพียง:
1. **ระบบปฏิบัติการ:** Windows 10 หรือ Windows 11 (64-bit)
2. **Arduino CLI หรือ Arduino IDE 2.x:**
   * หากเครื่องปลายทางลง **Arduino IDE 2.x** ไว้อยู่แล้ว โปรแกรม Redbrick Robotics Studio จะตรวจหา `arduino-cli.exe` และ Cores อัตโนมัติ
   * หรือหากดาวน์โหลดเฉพาะ `arduino-cli.exe` มา สามารถเปิดโปรแกรม Redbrick ไปที่ **Settings (`Ctrl+,`)** แล้วค้นหา `redbrickArduino.cli.path` เพื่อระบุตำแหน่งไฟล์ `arduino-cli.exe` ได้ทันที

---

## 6. แนวทางการแก้ไขปัญหาที่พบบ่อย (Troubleshooting)

1. **ข้อผิดพลาด "Unable to find Arduino CLI":**
   * เปิด Settings (`Ctrl+,`) แล้วพิมพ์ค้นหา `redbrickArduino.cli.path`
   * ใส่ตำแหน่งของ `arduino-cli.exe` เช่น `C:\Tools\arduino-cli.exe`
2. **คอมไพล์บอร์ด AVR แล้วติด Error ตัวอักษรภาษาไทย:**
   * ระบบ Redbrick ได้แก้ปัญหานี้ให้แล้ว โดยนำไดเรกทอรี build ไปไว้ที่ System Temp โฟลเดอร์ที่แปลงเป็น hashed path เพื่อป้องกันคอมไพเลอร์ avr-gcc ขัดข้องกับชื่อโฟลเดอร์ที่มีสระหรือภาษาไทย
3. **อัปโหลด ESP32 ไม่ผ่าน หรือ Port ไม่ตอบสนอง:**
   * เมื่ออัปโหลดไม่ผ่าน ให้กดปุ่ม **BOOT** บนบอร์ด ESP32 ค้างไว้ขณะโปรแกรมกำลังเชื่อมต่อ
   * ตรวจสอบว่าได้ปิดหน้าต่าง Serial Monitor อื่นๆ หรือไม่ (ระบบมีฟังก์ชันตัดการเชื่อมต่อ Serial อัตโนมัติก่อนอัปโหลดเพื่อไม่ให้พอร์ตชนกัน)

---
*เอกสารนี้สร้างขึ้นโดยระบบอัตโนมัติของโครงการ Redbrick Robotics Studio*
