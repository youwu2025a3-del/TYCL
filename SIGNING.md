# TYCL Windows 代码签名方案

当前 TYCL 的安装器和主程序都未签名。Windows SmartScreen 会把未知发布者的安装器标成风险，用户必须先点“更多信息 → 仍要运行”，这不是靠改代码能彻底消除的。

签名后仍然可能需要积累一段时间信誉，但至少发布者名称会固定显示，后续版本被拦截的概率会明显下降。

## 推荐顺序

### 1. SignPath Foundation（开源项目首选，免费）

TYCL 使用 MIT 许可证，如果源码放到公开仓库，可以申请 SignPath Foundation 的免费开源代码签名。

- 适合：公开 GitHub/GitLab 仓库、OSI 认可许可证
- 成本：通过审核后免费
- 方式：SignPath 在 CI 中代为签名，证书由 SignPath 管理
- 注意：需要提交项目说明、构建流程和发布地址，审核不是自动通过

这是目前最适合 TYCL 的路线。

### 2. Certum Open Source Code Signing（低成本）

如果不想把项目交给 SignPath 审核，可以购买 Certum 的开源代码签名证书。

- 适合：个人开发者、开源项目
- 成本：低于普通 OV 证书，按年付费
- 形式：云签名或硬件令牌
- 注意：需要提供开源项目证明，证书只能用于该项目

国内有 Certum 代理，购买和续费相对方便。

### 3. Azure Trusted Signing（CI 集成最省事）

微软的托管签名服务，按订阅收费，约 10 美元/月量级，具体价格和资格以 Azure 官网为准。

- 适合：已有 Azure 订阅、希望完全云端签名
- 方式：CI 调用 Trusted Signing，不需要插硬件令牌
- 注意：个人/组织资格和所在国家地区有限制，申请前先确认

### 4. Microsoft Store / MSIX

如果把 TYCL 打成 MSIX 上架 Microsoft Store，Store 会负责包签名，用户安装时不会看到 SmartScreen。

- 优点：签名和分发都由 Store 处理
- 缺点：需要开发者账号、商店审核，安装器/便携版仍需单独处理
- 适合作为后续分发渠道，不是当前安装器的替代品

### 不推荐：自签名证书

自签名证书只能让文件“有签名”，不能让 Windows 信任它。用户仍然会看到未知发布者，不能解决 SmartScreen，反而增加维护成本。

## 签名对象

至少需要签两个文件：

1. `TYCL.exe`：Electron 主程序
2. `TYCL-Setup-x.y.z.exe`：Inno Setup 安装器

更新包 `TYCL-update-x.y.z.zip` 是应用资源，不是 Windows 可执行文件，不需要 Authenticode；继续用 `update.json` 里的 SHA-256 校验完整性即可。

## 构建顺序

```text
electron-packager
  → 签名 dist/TYCL-win32-x64/TYCL.exe
  → Inno Setup 编译安装器
  → 签名 dist/TYCL-Setup-x.y.z.exe
  → 生成 update zip / update.json
```

签名必须在打包安装器之前完成。否则安装器里嵌入的是未签名的 `TYCL.exe`。

## Inno Setup 配置示例

拿到证书或 SignPath 的签名命令后，在 `installer/TYCL.iss` 的 `[Setup]` 段加入：

```ini
SignTool=signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 $f
SignedUninstaller=yes
```

如果使用 SignPath，把 `SignTool` 换成 SignPath 提供的签名命令。

## 验证

```powershell
signtool verify /pa /v dist\TYCL-Setup-1.2.0.exe
signtool verify /pa /v dist\TYCL-win32-x64\TYCL.exe
```

两条命令都应显示 `Successfully verified`。

## 发布时还要做

- `update.json` 保留正确 SHA-256
- 安装器和更新包使用同一版本号
- 不要频繁更换下载域名，SmartScreen 信誉和下载地址、签名主体都有关
- 如果使用 SignPath，发布产物应由 CI 构建，不要在本地手工替换文件后再签名

## 建议

短期先用 **SignPath Foundation** 申请免费签名；如果审核周期太长，再买 **Certum 开源代码签名** 过渡。Azure Trusted Signing 适合之后 CI 成熟时接入。
