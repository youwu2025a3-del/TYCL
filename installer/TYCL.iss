#define AppVersion GetEnv("TYCL_VERSION")
#ifndef AppVersion
  #define AppVersion "1.3.0"
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
ShowLanguageDialog=yes
UsePreviousAppDir=yes
ArchitecturesAllowed=x64compatible
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany=A3Y8
VersionInfoDescription=TYCL Installer
VersionInfoProductName=TYCL
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "languages\ChineseSimplified.isl"

[CustomMessages]
english.CreateDesktopIcon=Create a desktop shortcut
chinesesimplified.CreateDesktopIcon=创建桌面快捷方式
english.StartWithWindows=Start TYCL when Windows starts
chinesesimplified.StartWithWindows=开机自动启动 TYCL
english.AdditionalIcons=Additional shortcuts:
chinesesimplified.AdditionalIcons=附加图标：
english.StartupOptions=Startup options:
chinesesimplified.StartupOptions=启动选项：
english.UninstallIcon=Uninstall TYCL
chinesesimplified.UninstallIcon=卸载 TYCL
english.LaunchProgram=Launch TYCL
chinesesimplified.LaunchProgram=启动 TYCL

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "{cm:StartWithWindows}"; GroupDescription: "{cm:StartupOptions}"; Flags: unchecked

[Files]
Source: "..\dist\TYCL-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\TYCL"; Filename: "{app}\TYCL.exe"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallIcon}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\TYCL"; Filename: "{app}\TYCL.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "TYCL"; ValueData: """{app}\TYCL.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\TYCL.exe"; Description: "{cm:LaunchProgram}"; Flags: nowait postinstall skipifsilent
