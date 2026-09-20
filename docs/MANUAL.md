# คู่มือการทำงาน การติดตั้ง การพัฒนา และการ Build โปรเจกต์
# Redbrick Robotics Studio (Code - OSS Distribution)

---

## 1. บทนำและสถาปัตยกรรมระบบ (System Architecture)

**Redbrick Robotics Studio** คือโปรแกรมแก้ไขโค้ดและสภาพแวดล้อมพัฒนา (IDE) ที่พัฒนาขึ้นโดยต่อยอดจากโครงการโอเพนซอร์ส **Code - OSS** (แกนหลักของ Visual Studio Code) เพื่อใช้ในการเขียนโปรแกรมหุ่นยนต์และระบบสมองกลฝังตัว เช่น **Arduino, ESP32, STM32**

### หัวใจสำคัญของการออกแบบ (Core Principles)
1. **ไม่แก้ไขระบบแกนหลัก (Upstream Isolation):** รักษาซอร์สโค้ดของ VS Code ให้เหมือนต้นฉบับมากที่สุด เพื่อให้สามารถอัปเดตเวอร์ชันใหม่จาก Microsoft ได้อย่างราบรื่น โดยความสามารถเฉพาะตัวของ Redbrick ทั้งหมดจะถูกสร้างเป็น **Built-in Extension (`extensions/redbrick-arduino`)** แยกต่างหาก
2. **ภาพไอคอนต้นแบบจุดเดียว (Single Master Icon):** ใช้ไฟล์ [`Icon.png`](file:///d:/Desktop/Redbrick/IDE/Icon.png) ที่รากของโปรเจกต์เป็นต้นแบบเพียงไฟล์เดียว แล้วใช้สคริปต์อัตโนมัติแปลงเป็นไอคอนสำหรับทุก OS (Windows `.ico`, macOS `.icns`, Linux `.png`) โดยไม่มีการแก้งานปลายทางด้วยมือ
3. **ใช้พื้นที่จัดเก็บมาตรฐานของ Arduino (Standard Storage):** โปรแกรมจะเชื่อมต่อไปยังโฟลเดอร์มาตรฐานของ Arduino โดยตรง ได้แก่:
   * **Sketchbook:** `%USERPROFILE%\Documents\Arduino` (หรือโฟลเดอร์ OneDrive)
   * **Cores & Tools:** `%LOCALAPPDATA%\Arduino15`
   ทำให้สามารถใช้บอร์ดและไลบรารีร่วมกับโปรแกรม Arduino IDE 2.x ได้ทันที 100% โดยไม่ต้องลงซ้ำซ้อน

---

## 2. โครงสร้างและหน้าที่ของไฟล์ต่าง ๆ ในโปรเจกต์

```text
IDE/
├── Icon.png                          # ไฟล์ภาพไอคอนต้นแบบความละเอียดสูง (Master Branding Icon)
├── package.json                      # การตั้งค่าชื่อแอปเวอร์ชัน dev, script build, และ dependencies
├── product.json                      # การตั้งค่าแบรนด์ (Redbrick Robotics Studio), App ID, Open VSX Gallery
├── TASKS.md                          # รายการบันทึกความคืบหน้าของงานแต่ละเฟส
├── docs/                             # โฟลเดอร์จัดเก็บเอกสาร
│   ├── ARCHITECTURE.md               # สถาปัตยกรรมของโปรเจกต์
│   ├── ARDUINO_INTEGRATION.md        # รายละเอียดการเชื่อมโยงระบบเข้ากับ Arduino CLI
│   ├── ROADMAP.md                    # แผนการพัฒนาฟีเจอร์ในอนาคต
│   └── MANUAL.md                     # [เอกสารนี้] คู่มือการทำงาน การพัฒนา และการ Build
├── build/                            # สคริปต์การแพ็กเกจโปรแกรม
│   ├── gulpfile.extensions.ts        # ลงทะเบียน extension redbrick-arduino ให้คอมไพล์พร้อมระบบ
│   ├── gulpfile.vscode.win32.ts      # สคริปต์สร้างไฟล์ Portable และตัวติดตั้ง Inno Setup สำหรับ Windows
│   ├── gulpfile.vscode.linux.ts      # สคริปต์สร้างแพ็กเกจสำหรับระบบปฏิบัติการ Linux
│   ├── lib/electron.ts               # ควบคุมเวอร์ชันและการตั้งค่า Electron
│   └── win32/code.iss                # สคริปต์ Inno Setup สำหรับสร้าง RedbrickRoboticsStudioSetup.exe
├── extensions/
│   └── redbrick-arduino/             # ซอร์สโค้ดของ Built-in Extension สำหรับ Arduino
│       ├── package.json              # กำหนดคำสั่ง (Commands), เมนู, ปุ่มลัด, ไฮไลต์ไวยากรณ์, และธีมสี
│       ├── language-configuration.json # กฎโครงสร้างภาษาสำหรับไฟล์ .ino และ .pde
│       ├── syntaxes/                 # TextMate Grammar สำหรับไฮไลต์ฟังก์ชันและตัวแปรของ Arduino
│       ├── themes/redbrick-dark.json # ธีมสีเฉพาะ Redbrick Dark
│       ├── test/                     # ชุดทดสอบ Unit Tests (ทดสอบการเลือกบอร์ด, พอร์ต, การกรอง COM)
│       └── src/                      # ซอร์สโค้ดภาษา TypeScript
│           ├── extension.ts          # จุดเริ่มต้นการทำงานเมื่อ Extension ถูกโหลด (Entry Point)
│           ├── arduinoController.ts  # ตัวควบคุมหลัก จัดการสถานะบน Status Bar, Verify, Upload
│           ├── arduinoState.ts       # จัดการสถานะ พอร์ตที่เลือก บอร์ดที่เลือก และการรีเฟรชข้อมูล
│           ├── arduinoTypes.ts       # นิยามโครงสร้างข้อมูล (Interfaces & Types)
│           ├── boardModel.ts         # จัดการบอร์ด แยกและรวมค่า FQBN พร้อม Dynamic Options
│           ├── boardSelector.ts      # ระบบค้นหาและเลือกบอร์ดแบบ QuickPick
│           ├── arduinoManager.ts     # จัดการ Core, Library, และ Board Manager URL
│           ├── arduinoActions.ts     # ตัวสร้างเมนูด้านซ้ายบน Activity Bar
│           ├── serialMonitorPanel.ts # หน้าต่าง Serial Monitor แบบ Interactive Webview
│           ├── cli/
│           │   └── arduinoCli.ts     # ติดต่อสั่งการ arduino-cli.exe แปลงผลลัพธ์ JSON และ stream log
│           ├── platform/
│           │   └── arduinoPaths.ts   # ตรวจหาโฟลเดอร์ Sketchbook และ Arduino15 (รองรับ OneDrive)
│           └── workspace/
│               ├── arduinoWorkspace.ts      # สร้างและเปิดโฟลเดอร์ Sketch
│               ├── projectConfiguration.ts # จัดการไฟล์ .vscode/arduino.json และ IntelliSense
│               └── exampleDocuments.ts     # จัดการเปิดตัวอย่างโค้ด (Examples)
├── resources/                        # ทรัพยากรด้านภาพที่ถูกสร้างขึ้นสำหรับทุก OS
│   ├── win32/                        # code.ico และภาพกราฟิกสำหรับตัวติดตั้ง Inno Setup
│   ├── darwin/                       # code.icns สำหรับ macOS
│   └── linux/                        # code.png และไอคอนขนาด 16px - 512px สำหรับ Linux
├── scripts/                          # สคริปต์ช่วยเหลือในระหว่างการพัฒนา
│   ├── generate-icons.mjs            # สร้างไอคอนทุกขนาดจาก Icon.png โดยอัตโนมัติ
│   ├── verify-branding.mjs           # ตรวจสอบความถูกต้องของไฟล์ไอคอนและ product.json
│   ├── code.bat / code.sh            # สคริปต์เปิดรันโปรแกรมใน Development Mode ทันที
│   └── icon-tools/                   # โมดูลภายนอกที่ใช้ประมวลผลรูปภาพ (Sharp)
└── src/                              # โค้ดแกนหลักของ VS Code Workbench (Upstream)
    ├── main.ts                       # ทางเข้าของ Electron Main Process (ปรับชื่อ UserData)
    └── vs/base/common/product.ts     # เพิ่มฟิลด์ companyName และ copyright ใน interface
```

---

## 3. สิ่งที่ติดตั้งในระบบแล้ว และสิ่งที่ต้องเตรียม (Prerequisites)

### 3.1 สำหรับเครื่องที่ใช้พัฒนาและ Build โปรแกรม
1. **Node.js (Toolchain สำหรับ VS Code):**
   * VS Code ต้องใช้ Node.js เวอร์ชันเฉพาะตามไฟล์ `.nvmrc` คือ **Node.js 24.18.0**
   * ในโปรเจกต์มีตัว Toolchain แบบพกพาติดตั้งไว้แล้วที่:
     `d:\Desktop\Redbrick\IDE\.build\toolchain\node-v24.18.0-win-x64\node.exe`
2. **Visual Studio 2022 Build Tools (บน Windows):**
   * ต้องติดตั้ง Workload: **Desktop development with C++**
   * มีคอมโพเนนต์ MSVC Compiler, Spectre-mitigated libraries, และ Windows 11 SDK (ติดตั้งไว้ที่ `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`)
3. **Git for Windows & Git LFS:** ติดตั้งสำหรับจัดการไฟล์ซอร์สโค้ดและไฟล์ภาพขนาดใหญ่
4. **Arduino CLI / Arduino IDE:**
   * ตรวจพบในระบบที่: `C:\Users\sakda\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`
   * ระบบสามารถค้นพบตำแหน่งนี้และเรียกใช้ได้อัตโนมัติ
5. **Cores & Libraries ที่มีในเครื่องปัจจุบัน:**
   * Cores: `esp32:esp32` (v3.3.11), `arduino:avr` (v1.8.8), `stm32duino:STM32F1`, `STMicroelectronics:stm32`, `FRIENDROBOT_AVR:avr`
   * Libraries: `Adafruit_BusIO`, `Adafruit_GFX_Library`, `Adafruit_MPU6050`, `Adafruit_SSD1306`, `BluetoothSerial`, `micro_ros_arduino`, `MPU6050` (อยู่ในโฟลเดอร์ OneDrive Documents)

---

## 4. วิธีแก้ไขและพัฒนาโปรเจกต์ต่อ (Development Guide)

### 4.1 การตั้งค่าก่อนเริ่มทำงานในแต่ละครั้ง
เปิด PowerShell แล้วรันคำสั่งเพื่อกำหนดให้ระบบใช้งาน Node.js v24 ของโปรเจกต์:
```powershell
cd D:\Desktop\Redbrick\IDE
$nodeDir = Join-Path $PWD '.build\toolchain\node-v24.18.0-win-x64'
$env:PATH = "$nodeDir;$env:PATH"
```

### 4.2 การแก้ไขโค้ด Extension Arduino (`extensions/redbrick-arduino`)
เมื่อท่านแก้ไขโค้ดในโฟลเดอร์ `extensions/redbrick-arduino/src/`:
1. **ตรวจเช็ค Error ของ TypeScript:**
   ```powershell
   & "D:\Desktop\Redbrick\IDE\node_modules\.bin\tsc.cmd" -p D:\Desktop\Redbrick\IDE\extensions\redbrick-arduino\tsconfig.json --noEmit
   ```
   *(ต้องได้ผลลัพธ์ว่างเปล่า ไม่มี Error)*
2. **รันชุดทดสอบ Unit Tests:**
   ```powershell
   cd extensions/redbrick-arduino
   npm test
   cd ../..
   ```
   *(ต้องผ่านครบทั้ง 9 รายการ เช่น การกรองพอร์ต Bluetooth, การเลือกบอร์ด, การปิดพอร์ต Serial)*
3. **คอมไพล์ Extension:**
   ```powershell
   npm run gulp compile-extension:redbrick-arduino
   ```

### 4.3 การเปลี่ยนโลโก้และไอคอนของโปรแกรม
1. วางไฟล์ภาพโลโก้ใหม่ขนาดสี่เหลี่ยมจัตุรัส (แนะนำ 1024x1024 px นามสกุล `.png`) บันทึกทับไฟล์ [`Icon.png`](file:///d:/Desktop/Redbrick/IDE/Icon.png) ที่รากของโปรเจกต์
2. รันคำสั่งสร้างไอคอนทุกขนาดอัตโนมัติ:
   ```powershell
   npm run generate-icons
   ```
3. ตรวจสอบความถูกต้องของไอคอนและ Metadata:
   ```powershell
   npm run verify-branding
   ```

### 4.4 การทดลองเปิดใช้งานโปรแกรมทันที (Development Run)
สามารถสั่งรัน Editor ขึ้นมาทดสอบการทำงานได้ทันทีด้วยคำสั่ง:
```powershell
.\scripts\code.bat
```

---

## 5. วิธีการ Build เพื่อนำไปใช้งานบนเครื่องอื่น (Build & Distribution)

มี 2 รูปแบบหลักในการนำโปรแกรมไปแจกจ่ายหรือใช้งานบนคอมพิวเตอร์เครื่องอื่น:

### วิธีที่ 1: Build แบบพกพา ไม่ต้องติดตั้ง (Portable Package) - แนะนำและสะดวกที่สุด
วิธีนี้จะได้โฟลเดอร์โปรแกรมที่พร้อมทำงาน สามารถบีบอัดเป็น `.zip` ส่งให้เครื่องอื่นแตกไฟล์ใช้งานได้ทันที

1. **เปิด PowerShell แล้วกำหนด PATH ให้ใช้ Node v24:**
   ```powershell
   cd D:\Desktop\Redbrick\IDE
   $nodeDir = Join-Path $PWD '.build\toolchain\node-v24.18.0-win-x64'
   $env:PATH = "$nodeDir;$env:PATH"
   ```
2. **รันคำสั่งคอมไพล์โปรแกรมสำหรับ Windows 64-bit:**
   ```powershell
   npm run gulp vscode-win32-x64
   ```
3. **ผลลัพธ์ที่ได้:**
   * โปรแกรมจะถูกสร้างออกมาที่โฟลเดอร์:
     [`D:\Desktop\Redbrick\VSCode-win32-x64`](file:///D:/Desktop/Redbrick/VSCode-win32-x64)
   * ไฟล์เปิดใช้งานคือ: **`Redbrick Robotics Studio.exe`**
4. **การนำไปใช้งานบนเครื่องอื่น:**
   * คลิกขวาที่โฟลเดอร์ `VSCode-win32-x64` แล้วเลือก **Compress to ZIP file**
   * ส่งไฟล์ `.zip` ไปยังเครื่องอื่น แตกไฟล์ แล้วดับเบิลคลิก `Redbrick Robotics Studio.exe` เพื่อเปิดใช้งานได้ทันที

---

### วิธีที่ 2: Build เป็นไฟล์ติดตั้ง Windows Setup (`.exe`)
วิธีนี้จะสร้างไฟล์ติดตั้งตัวเดียว ผู้ใช้ปลายทางสามารถกด Next เพื่อติดตั้งโปรแกรมลงในระบบ Windows (สร้าง Shortcut บน Desktop และ Start Menu อัตโนมัติ)

1. **ตรวจสอบว่ามีโปรแกรม Inno Setup 6 ติดตั้งในเครื่อง**
2. **รันคำสั่งสร้างตัวติดตั้ง:**
   ```powershell
   npm run gulp vscode-win32-x64
   npm run gulp vscode-win32-x64-inno-updater
   npm run gulp vscode-win32-x64-user-setup
   ```
3. **ผลลัพธ์ที่ได้:**
   * ไฟล์ติดตั้งจะอยู่ที่:
     `D:\Desktop\Redbrick\IDE\.build\win32-x64\user-setup\RedbrickRoboticsStudioSetup.exe` (ขนาดประมาณ 279 MB)
   * สามารถนำไฟล์ `.exe` นี้ไปแจกจ่ายให้ผู้ใช้ติดตั้งได้ทันที

---

### 5.1 สิ่งที่เครื่องปลายทาง (Target Machine) ต้องมี
เครื่องคอมพิวเตอร์เครื่องอื่นที่นำโปรแกรมไปใช้งาน:
* **ไม่ต้องติดตั้ง Node.js**
* **ไม่ต้องติดตั้ง Visual Studio Build Tools**
* **ต้องการเพียง:**
  1. ระบบปฏิบัติการ Windows 10 หรือ Windows 11 (64-bit)
  2. ติดตั้งโปรแกรม **Arduino IDE 2.x** (แนะนำ) หรือดาวน์โหลด `arduino-cli.exe` เพื่อให้มีคอมไพเลอร์ฮาร์ดแวร์
  3. หากโปรแกรมหา Arduino CLI ไม่เจอ ให้ไปที่เมนู **Settings (`Ctrl+,`)** พิมพ์ค้นหา `redbrickArduino.cli.path` แล้วระบุตำแหน่งของไฟล์ `arduino-cli.exe`

---

## 6. แนวทางแก้ไขปัญหาที่พบบ่อย (Troubleshooting)

1. **หา Arduino CLI ไม่เจอ (Unable to find Arduino CLI):**
   * ให้เปิดหน้า Settings ด้วยคีย์ลัด `Ctrl+,`
   * ค้นหา `redbrickArduino.cli.path` แล้วใส่ตำแหน่งของไฟล์ `arduino-cli.exe` เช่น `C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`
2. **คอมไพล์บอร์ด AVR แล้วติดปัญหาชื่อโฟลเดอร์ภาษาไทย:**
   * ระบบ Redbrick ได้แก้ไขปัญหานี้ให้แล้ว โดยกำหนดให้ build artifacts ไปสร้างในไดเรกทอรี Temp ของระบบด้วย Hashed path สากล ทำให้ชื่อโฟลเดอร์ภาษาไทยไม่ส่งผลต่อคอมไพเลอร์ avr-gcc
3. **อัปโหลด ESP32 ไม่ผ่าน หรือ Port ไม่ตอบสนอง:**
   * ขณะที่โปรแกรมแสดงข้อความกำลังเชื่อมต่อ (Connecting.....) ให้กดปุ่ม **BOOT** บนบอร์ด ESP32 ค้างไว้ 2-3 วินาที
   * หากพอร์ตถูกใช้งานอยู่ ระบบของ Redbrick จะตัดการเชื่อมต่อ Serial Monitor โดยอัตโนมัติก่อนเริ่มอัปโหลดเพื่อป้องกันพอร์ตชนกัน
4. **ปัญหาการ Push ขึ้น GitHub ครั้งแรก:**
   * โปรเจกต์นี้เริ่มต้นด้วย Shallow Clone จาก VS Code หากต้องการ Push ขึ้น GitHub Repository ใหม่ ต้องใช้ Root Commit เพื่อไม่ให้ GitHub ปฏิเสธการ Unpack ข้อมูล

---
*จัดทำขึ้นสำหรับโครงการ Redbrick Robotics Studio*
