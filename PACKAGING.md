# TYCL 打包与分发

## 当前分发方式

- `TYCL-Setup-x.y.z.exe`：Inno Setup 安装器，安装到当前用户目录
- `TYCL-update-x.y.z.zip`：只包含 `app.asar` 的增量更新包
- `update.json` / `beta-update.json`：稳定版 / 测试版更新清单

## 增量更新

TYCL 的更新包不是完整的 96 MB 安装器，而是压缩后的 `app.asar`。安装器体积主要来自 Electron 运行时和 Chromium 资源，这些文件在版本之间很少变化。

因此当前更新流程已经具备“增量”效果：

```text
更新包约 3–9 MB
  → 只替换 resources/app.asar
  → 不重装 Electron 运行时
  → 不删除游戏、存档和账户
```

如果以后要做二进制级 delta，需要 bsdiff/HDiffPatch 和旧版本基线，收益有限，暂不优先。

## MSIX / Microsoft Store

MSIX 需要 Windows SDK 的 `MakeAppx.exe` 和 Microsoft Store 开发者账号，当前构建环境没有安装 SDK，所以没有直接生成 `.msix`。可用路线：

1. 安装 Windows SDK（包含 MakeAppx）
2. 用 `electron-builder --win appx` 或 `electron-windows-store` 生成 MSIX 包
3. 配置 `AppxManifest.xml`：应用标识、显示名称、图标、`runFullTrust` 能力
4. 用 `MakeAppx pack /d <目录> /p TYCL.msix`
5. 在 Partner Center 提交 MSIX

Store 会为 MSIX 包签名，用户从商店安装时不会看到 SmartScreen。但安装在商店之外的安装器仍然需要自己的代码签名，见 [SIGNING.md](SIGNING.md)。

## 稳定版 / 测试版

```powershell
# 稳定版
npm run update:pack

# 测试版
$env:UPDATE_CHANNEL='beta'; npm run update:pack
```

测试版会生成 `beta-update.json` 和 `TYCL-beta-x.y.z.zip`。在设置中切换更新通道后，TYCL 会优先读取 `beta-update.json`，找不到时回退到稳定版清单。

## 发布检查清单

- [ ] `npm run package:win`
- [ ] `npm run installer:pack`
- [ ] `npm run update:pack`
- [ ] `npm run pages:pack`
- [ ] 校验 `installer.json` 分卷 SHA-256
- [ ] 上传 `pages-upload` 全部文件
- [ ] 确认 `update.json` 的 `downloadUrl` 可访问
- [ ] 签名 `TYCL.exe` 和安装器（有证书时）
