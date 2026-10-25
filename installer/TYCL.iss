#define AppVersion GetEnv("TYCL_VERSION")
#ifndef AppVersion
  #define AppVersion "1.1.5"
#endif

[Setup]
AppId={{D3C0A8E4-7F2B-4B7F-9D3A-8A3B8C9D0E1F}
AppName=TYCL
AppVersion={#AppVersion}
AppVerName=TYCL {#AppVersion}
AppPublisher=A3Y8
AppPublisherURL=https://tycl-updates-a3y8.youwu2025a3.workers.dev/
AppSupportURL=mailto:tianyi76@yeah.net
AppUpdatesURL=https://tycl-updates-a3y8.youwu2025a3.workers.dev/
DefaultDirName={localappdata}\Programs\TYCL
DefaultGroupName=TYCL
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=TYCL-Setup-{#AppVersion}
SetupIconFile=..\src\assets\icon.ico
UninstallDisplayIcon={app}\TYCL.exe
UninstallDisplayName=TYCL {#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes
ArchitecturesAllowed=x64compatible
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany=A3Y8
VersionInfoDescription=TYCL Installer
VersionInfoProductName=TYCL
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "chinesesimplified"; MessagesFile: "languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加图标："
Name: "startup"; Description: "开机自动启动 TYCL"; GroupDescription: "启动选项："; Flags: unchecked

[Files]
Source: "..\dist\TYCL-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\TYCL"; Filename: "{app}\TYCL.exe"; WorkingDir: "{app}"
Name: "{group}\卸载 TYCL"; Filename: "{uninstallexe}"
Name: "{autodesktop}\TYCL"; Filename: "{app}\TYCL.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "TYCL"; ValueData: """{app}\TYCL.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\TYCL.exe"; Description: "启动 TYCL"; Flags: nowait postinstall skipifsilent
