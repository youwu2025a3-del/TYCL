# TYCL 更新服务器部署指南

这份指南用于把刚买好的 2 核 2G 挂机宝变成 TYCL 的更新 / 文件下载服务器。

> 只需要托管 TYCL 的 `update.json` 和小体积更新 zip，不要公开分发 Minecraft 游戏本体、Mod 或整合包等第三方内容。

---

## 先确认三件事

1. 系统是 **Windows** 还是 **Linux**？
2. 商家是否给了 **公网 IP**，还是只有 NAT 端口映射？
3. 有没有可用的域名，80 / 443 端口是否被封？

没有公网 IP 或端口被封时，优先使用 **Cloudflare Tunnel** 或 **FRP**，不要在路由器 / 系统上硬折腾。

---

## 只有远程桌面、没有公网 IP

很多挂机宝只提供远程桌面，并不提供公网 IP 或公网端口，这种机器**不能直接让外网访问 8080**。先检查商家控制台是否有“端口映射 / NAT 转发 / 公网端口”选项；如果没有，直接按本文前面的 `http://公网IP:8080` 是走不通的。

没有公网 IP 时，推荐使用下面的方案：

### 方案 A：Tailscale Funnel（无需公网 IP，有稳定 HTTPS 地址）

适合想继续用这台挂机宝托管更新文件的情况：

1. 在挂机宝安装 Tailscale 并登录。
2. 在 Tailscale 管理后台启用 HTTPS / Funnel。
3. 按本文前面的方法在本机启动 Caddy，只监听 `8080`。
4. 在服务器运行：

```powershell
tailscale funnel --bg 8080
```

它会生成一个类似下面的 HTTPS 地址：

```text
https://你的机器名.你的tailnet.ts.net/
```

把 `https://你的机器名.你的tailnet.ts.net/update.json` 填进 TYCL 即可。

注意：Funnel 在中国大陆的访问速度可能不稳定；需要 Tailscale 账户，并确认你的 tailnet 已启用 Funnel。

### 方案 B：Cloudflare Tunnel

有 Cloudflare 域名时，可以使用命名 Tunnel，得到一个稳定的 HTTPS 地址，不需要开放入站端口：

```powershell
cloudflared tunnel --url http://127.0.0.1:8080
```

上面的命令是临时 Quick Tunnel，地址每次重启都会变，只适合测试。正式使用需要配置命名 Tunnel 并绑定域名。

### 方案 C：干脆不用这台机器托管

更新包只有约 2.3 MB，直接放到 **Cloudflare Pages、GitHub Releases、对象存储** 这类静态托管服务更简单、更稳定，也不需要公网 IP：

- `update.json` 和更新 zip 上传后获得 HTTPS 地址；
- 把地址填进 TYCL 的更新源即可；
- 挂机宝可以继续留着做其他事情。

对于个人开发者，**Cloudflare Pages + 自定义 Pages 域名** 通常是成本最低、最省心的方案。

## Windows 挂机宝最快部署

以下路径假设你把文件放在 `C:\TYCL-Server`。也可以换成其他目录，同时修改 `Caddyfile`。

### 1. 创建目录

在服务器上打开 PowerShell（管理员）：

```powershell
New-Item -ItemType Directory -Force C:\TYCL-Server\public
```

### 2. 安装 Caddy

把项目里的 `server` 文件夹复制到服务器，例如：

```text
C:\TYCL-Server\caddy.exe          # 待下载
C:\TYCL-Server\Caddyfile
C:\TYCL-Server\install-caddy.ps1
C:\TYCL-Server\start-tycl-server.bat
C:\TYCL-Server\public\            # 放更新文件
```

在 `C:\TYCL-Server` 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-caddy.ps1
```

脚本会从 Caddy 官方接口下载 Windows 版 `caddy.exe`。如果服务器访问 GitHub 太慢，可以在本地电脑下载后通过远程桌面复制过去。

把 `Caddyfile.example` 重命名为 `Caddyfile`（如果还没有）。

### 3. 放更新文件

将以下文件复制到 `C:\TYCL-Server\public\`：

```text
update.json
TYCL-update-1.1.1.zip
```

将 `update.json` 改成你的公网地址，例如：

```json
{
  "version": "1.1.1",
  "notes": "本次更新内容",
  "downloadUrl": "http://你的公网IP:8080/TYCL-update-1.1.1.zip",
  "sha256": "更新包 SHA-256",
  "publishedAt": "2026-10-25T00:00:00.000Z"
}
```

注意：`downloadUrl` 必须是**外部可访问**的地址，不能写 `127.0.0.1` 或本地路径。

### 4. 放行防火墙端口

如果使用 8080：

```powershell
New-NetFirewallRule -DisplayName "TYCL Update HTTP 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

如果挂机宝使用 NAT 端口映射，还需要在商家控制台把公网端口映射到服务器的 8080。

### 5. 启动

双击 `start-tycl-server.bat`，或在 PowerShell 中：

```powershell
cd C:\TYCL-Server
.\caddy.exe run --config Caddyfile
```

保持窗口开启。想长期后台运行，可以把 Caddy 注册为 Windows 服务：

```powershell
.\caddy.exe install
Start-Service caddy
```

### 6. 从外网验证

在你自己的电脑浏览器打开：

```text
http://你的公网IP:8080/update.json
```

再测试更新包：

```text
http://你的公网IP:8080/TYCL-update-1.1.1.zip
```

能下载就说明服务器通了。

### 7. 填进 TYCL

打开 TYCL：

**设置 → 更新与公告 → 更新源地址**

填入：

```text
http://你的公网IP:8080/update.json
```

然后点击 **检查**，或打开「更新公告 → 检查更新」。

---

## Linux 挂机宝

Linux 更适合 2G 内存。以 Ubuntu 为例：

```bash
sudo apt update
sudo apt install -y caddy
sudo mkdir -p /srv/tycl
sudo chown -R $USER:$USER /srv/tycl

# 上传 update.json 和 update zip 到 /srv/tycl
```

简单启动：

```bash
cd /srv/tycl
caddy file-server --listen :8080
```

放行防火墙：

```bash
sudo ufw allow 8080/tcp
```

浏览器访问 `http://公网IP:8080/update.json`。

## 有域名时启用 HTTPS

推荐使用域名 + Caddy 自动签发证书。DNS 把 `tycl.example.com` 解析到服务器 IP，然后 `Caddyfile` 写：

```caddyfile
tycl.example.com {
    root * /srv/tycl
    file_server
    encode gzip
}
```

确保 80 和 443 端口对公网开放。

如果是 NAT 机或 443 被封，可以使用 Cloudflare Tunnel：

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

它会生成一个临时 HTTPS 地址。正式使用建议在 Cloudflare 里创建命名 Tunnel 并绑定自己的域名。

---

## 发布新版本的正确流程

假设要发布 `1.1.1`：

1. 在本地开发机修改 `package.json` 和 `package-lock.json` 中的版本号为 `1.1.1`。
2. 构建：

```bash
npm run package:win
npm run update:pack
```

3. 把生成的 `dist/TYCL-update-1.1.1.zip` 上传到服务器 `public` 目录。
4. 编辑 `update.json`：

```json
{
  "version": "1.1.1",
  "notes": "1.1.1 更新内容",
  "downloadUrl": "https://你的域名/TYCL-update-1.1.1.zip",
  "sha256": "把 zip 的 SHA-256 填在这里"
}
```

5. 在 TYCL 里检查更新并安装。

改完 `update.json` 后建议把文件缓存时间设短一些，避免用户一直拿到旧清单。Caddy 默认不缓存静态文件；如果前面套了 CDN，请给 `update.json` 单独设置不缓存或短缓存。

---

## 安全建议

- 不要长期把远程桌面的 3389 端口暴露在公网；尽量用商家控制台的远程桌面或 VPN/白名单。
- 使用强密码，开启服务器防火墙。
- 只开放需要的端口，下载目录只读。
- 更新包建议始终配置 SHA-256 校验。
- 挂机宝通常没有高可用保障，重要文件保留本地备份。
- 不要把它当成 Minecraft 游戏本体的公开 CDN 或大规模整合包分发服务器。

## 常见问题

**访问 update.json 返回 404？**
检查 Caddy 的 `root` 是否指向了 `public` 目录，文件名大小写是否一致。

**能访问 localhost，外网访问不了？**
检查商家控制台的端口映射、Windows 防火墙、以及公网 IP 是否真实可用。

**TYCL 检查更新显示未配置？**
确认更新源地址填的是完整的 `http(s)://.../update.json`，不是文件夹地址。

**检查到新版本但下载失败？**
用浏览器直接打开 `downloadUrl`，确认 zip 能下载；再核对 JSON 中的版本、URL 和 SHA-256。
