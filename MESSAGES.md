# 消息中心 / 祝福推送

TYCL 会从 COS 拉取公开的 `blessings.json`，不需要更新客户端。

## COS 地址

```text
https://tycl-1327923012.cos.ap-shanghai.myqcloud.com/tycl/blessings.json
```

把仓库根目录的 `blessings.json` 上传到 COS 的 `tycl/blessings.json` 即可。

当前仓库里的 `blessings.json` 是空模板：

```json
{ "items": [] }
```

客户端不内置任何示例祝福；没有上传内容时，消息中心就是空的。

## 格式

```json
{
  "items": [
    {
      "id": "unique-id",
      "title": "标题",
      "message": "正文",
      "author": "A3Y8",
      "date": "2026-12-25",
      "type": "blessing",
      "link": ""
    }
  ]
}
```

- `id` 必须唯一，用来合并消息和记录已读。
- `type` 可以是 `blessing` 或 `notice`。
- `link` 可选，只允许 http/https。
- 修改 JSON 后，用户下次打开启动器或点消息中心的「刷新」即可看到。

## 保存规则

- 所有消息保存在 `%APPDATA%\TYCL\data\messages.json`。
- 刷新只会新增或更新，不会删除旧消息。
- 已读状态保存在同一个文件。
- COS 不可用时显示本地保存的消息和内置信封。

## 更新公告

更新公告和消息中心是分开的。检查更新在更新公告最上方；消息中心在右上角铃铛。
