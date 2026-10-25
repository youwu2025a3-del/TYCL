# TYCL 更新服务器一键部署包

这是一个自包含的 Windows 挂机宝部署包，解压后只需运行一个 PowerShell 脚本。

## 使用

1. 把整个文件夹复制到服务器，例如 `C:\TYCL-Server-Auto`。
2. 右键 `setup-windows.ps1`，选择 **使用 PowerShell 运行**。
3. 如果没有管理员权限，脚本会自动请求。
4. 按提示输入：
   - 公网 IP 或域名
   - 内部端口（默认 8080）
   - 公网端口（有 NAT 映射时填写映射后的端口，否则直接回车）
5. 等待脚本下载 Caddy、生成配置、安装启动任务、公网端口检测完成。

完成后，脚本会输出：

```text
http://你的地址:端口/update.json
```

把这条地址填进 TYCL：

**设置 → 更新与公告 → 更新源地址**

然后点击「检查」。

## 文件说明

- `setup-windows.ps1`：一键安装、配置、启动脚本
- `public/TYCL-update-1.1.1.zip`：当前更新包
- 安装目录：`C:\TYCL-Server`
- Caddy 日志：`C:\TYCL-Server\access.log`
- 启动任务：`TYCL Update Server`（开机自动启动）

## 注意

- 这个脚本使用 HTTP。有域名和公网 80/443 时，建议手动改成 Caddy 自动 HTTPS。
- 如果挂机宝是 NAT 共享 IP，自动检测到的 IP 可能不是你的入口地址，请输入商家给你的公网地址和映射端口。
- 如果 Windows Server 没有 `ScheduledTasks` 模块，启动任务会创建失败，但当前进程仍会启动 Caddy；可以重启后手动运行 `C:\TYCL-Server\start-tycl-server.bat`，或使用 Caddy 服务方式。
- 当前 kit 里的更新包版本是 1.1.1，和已安装版本相同，所以检查更新会显示已是最新。要测试更新流程，可以把 `update.json` 里的 `version` 临时改成 `1.1.2`；正式发布请按 README 重新构建新版本。
- 不要公开分发 Minecraft 游戏本体或第三方资源。
