# TYCL 隐私说明

TYCL 是一个本地运行的 Minecraft 启动器，不包含遥测、广告或用户行为分析。

## 本地保存的数据

以下数据只保存在你的电脑上，默认位于 `%APPDATA%\TYCL`：

- 启动器设置、主题、下载源
- 本地账户名称与皮肤文件
- 游戏实例、Mod、存档、资源包、截图和日志
- Microsoft 登录返回的令牌（仅用于启动游戏和刷新登录状态）
- 更新检查时间与更新包缓存

卸载 TYCL 不会自动删除这些数据；你可以手动删除 `%APPDATA%\TYCL` 清除。

## 网络请求

TYCL 会访问以下服务：

- Mojang / BMCLAPI：Minecraft 版本清单、游戏文件、资源文件
- Modrinth：Mod 与整合包搜索、项目信息、下载
- Minecraft 官方内容接口：新闻
- Cloudflare：TYCL 更新清单与更新包
- Google / MyMemory：Mod 与新闻的可选翻译
- Microsoft / Xbox Live：正版账户登录

请求中可能包含你的 IP 地址、User-Agent 和所请求的资源标识。TYCL 不会把这些信息汇总上传到自建服务器，也不会出售或分享用户数据。

## 翻译功能

当你点击「汉化」或「翻译成中文」时，待翻译的标题和介绍文本会发送到第三方翻译服务。不会发送账户令牌、本地路径或游戏存档。

## Microsoft 账户

正版登录使用 Microsoft OAuth。访问令牌和刷新令牌保存在本机，用于启动游戏和刷新登录。TYCL 不会把你的令牌发送到除 Microsoft / Xbox / Mojang 官方接口之外的服务。

## 日志

启动日志只保存在本机，用于诊断启动问题。诊断报告只在本地生成，除非你主动复制并发送。

## 联系方式

问题与数据相关请求：tianyi76@yeah.net

TYCL 不隶属于 Mojang Studios 或 Microsoft。
