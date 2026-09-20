[CmdletBinding()]
param(
	[ValidateSet('x64', 'arm64')]
	[string]$Architecture = 'x64',

	[ValidateSet('none', 'user', 'system')]
	[string]$Installer = 'user'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$expectedNodeVersion = (Get-Content -LiteralPath (Join-Path $repositoryRoot '.nvmrc') -Raw).Trim()
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$activeNodeVersion = if ($nodeCommand) { (& node.exe --version).Trim().TrimStart('v') } else { '' }

if (-not $nodeCommand -or $activeNodeVersion -ne $expectedNodeVersion) {
	$hostArchitecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
	$bundledNodeDirectory = Join-Path $repositoryRoot ".build\toolchain\node-v$expectedNodeVersion-win-$hostArchitecture"
	if (Test-Path -LiteralPath (Join-Path $bundledNodeDirectory 'node.exe')) {
		$env:PATH = "$bundledNodeDirectory;$env:PATH"
		$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
		$activeNodeVersion = (& node.exe --version).Trim().TrimStart('v')
	}
}

if (-not $nodeCommand) {
	throw "Node.js $expectedNodeVersion is required. Install it or select it with nvm-windows before running this script."
}

$actualNodeVersion = (& node.exe --version).Trim().TrimStart('v')
if ($actualNodeVersion -ne $expectedNodeVersion) {
	throw "Node.js $expectedNodeVersion is required, but $actualNodeVersion is active."
}

$signToolCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signToolCommand) {
	$programFilesX86 = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFilesX86)
	$windowsKitsBin = Join-Path $programFilesX86 'Windows Kits\10\bin'
	if (Test-Path -LiteralPath $windowsKitsBin) {
		$sdkDirectories = Get-ChildItem -LiteralPath $windowsKitsBin -Directory | Sort-Object {
			try { [version]$_.Name } catch { [version]'0.0' }
		} -Descending
		foreach ($sdkDirectory in $sdkDirectories) {
			$candidate = Join-Path $sdkDirectory.FullName "$Architecture\signtool.exe"
			if (Test-Path -LiteralPath $candidate) {
				$env:PATH = "$($sdkDirectory.FullName)\$Architecture;$env:PATH"
				$signToolCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
				break
			}
		}
	}
}

if (-not $signToolCommand) {
	throw 'signtool.exe was not found. Install the Windows 10/11 SDK with Visual Studio Build Tools.'
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
	throw 'npm.cmd was not found next to the active Node.js installation.'
}

# Build tasks query Git metadata. Mark only this checkout as safe for child
# processes so a copied repository can build under a different Windows account
# without changing that account's global Git configuration.
$gitConfigIndex = if ($env:GIT_CONFIG_COUNT) { [int]$env:GIT_CONFIG_COUNT } else { 0 }
[Environment]::SetEnvironmentVariable("GIT_CONFIG_KEY_$gitConfigIndex", 'safe.directory', 'Process')
[Environment]::SetEnvironmentVariable("GIT_CONFIG_VALUE_$gitConfigIndex", ($repositoryRoot -replace '\\', '/'), 'Process')
$env:GIT_CONFIG_COUNT = [string]($gitConfigIndex + 1)

function Invoke-Npm {
	param([Parameter(Mandatory)][string[]]$Arguments)
	Write-Host "`n> npm.cmd $($Arguments -join ' ')" -ForegroundColor Cyan
	& npm.cmd @Arguments
	if ($LASTEXITCODE -ne 0) {
		throw "npm.cmd failed with exit code $LASTEXITCODE"
	}
}

Write-Host "Repository : $repositoryRoot"
Write-Host "Node       : $(& node.exe --version)"
Write-Host "SignTool   : $($signToolCommand.Source)"
Write-Host "Target     : win32-$Architecture"
Write-Host "Installer  : $Installer"

Invoke-Npm @('run', 'verify-branding')
Invoke-Npm @('run', 'gulp', "vscode-win32-$Architecture")

$portableDirectory = Join-Path (Split-Path -Parent $repositoryRoot) "VSCode-win32-$Architecture"
Write-Host "`nPortable application: $portableDirectory" -ForegroundColor Green

if ($Installer -ne 'none') {
	Invoke-Npm @('run', 'gulp', "vscode-win32-$Architecture-inno-updater")
	Invoke-Npm @('run', 'gulp', "vscode-win32-$Architecture-$Installer-setup")
	$setupPath = Join-Path $repositoryRoot ".build\win32-$Architecture\$Installer-setup\RedbrickRoboticsStudioSetup.exe"
	if (-not (Test-Path -LiteralPath $setupPath)) {
		throw "Expected installer was not created: $setupPath"
	}
	Write-Host "Installer: $setupPath" -ForegroundColor Green
}
