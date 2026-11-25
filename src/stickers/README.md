# 贴纸包（stickers）

本地图片贴纸按分类展示，点按直插发送。

## 文件
- `plugin/manifest.json` — 声明
- `plugin/plugin.js` — 渲染逻辑（读 data.json 的 stickers.packs）
- `plugin/data.json` — 分类与图片声明
- `plugin/*.png` — 贴纸图片

## 怎么改

**加贴纸**：图片放 `plugin/` 目录，`data.json` 对应 pack 的 `images` 数组加文件名。
```json
{
  "stickers": { "packs": [
    { "label": "表情", "images": ["smile.png", "heart.png"] },
    { "label": "符号", "images": ["star.png", "check.png"] }
  ]}
}
```

**加分类**：packs 数组加一项（每个 pack 一个 tab）。

**改列数**：plugin.js 里 `cols: 4`。

**设置项**：`shareFallback`（直插失败时分享兜底开关，默认开）。

## 打包
- `python3 tools/meng_pack.py stickers` → `dist/stickers-v<version>.meng`

## 机制
- 图片格子 `{image: "文件名"}` → 宿主 IMAGE_COMMIT 前缀 → 拼插件目录绝对路径 → commitImage 直插
- 直插失败（目标不支持）→ 按 `shareFallback` 设置决定弹分享或只提示
- 分享用精确 MIME（按扩展名），接收方不转码

## 升级注意
- manifest `version` +1；图片文件名必须与 data.json 一致（大小写敏感）
- 支持格式：png/jpg/webp/gif