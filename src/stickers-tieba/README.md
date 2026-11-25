# 贴吧表情（stickers-tieba）

93 张贴吧表情 webp 单包平铺（无 tab 头），点按直插发送。

## 文件
- `plugin/manifest.json` — 声明
- `plugin/plugin.js` — 渲染：合并 packs 平铺单 grid（表情包不分组）
- `plugin/data.json` — 单 pack「贴吧表情」，93 张图声明
- `plugin/001-093.webp` — 表情图

## 怎么改

**加表情**：图片放 `plugin/`（命名建议延续数字），`data.json` 的 `stickers.packs[0].images` 数组加文件名。

**改列数**：plugin.js 里 `cols: 4`。

**设置项**：`shareFallback`（分享兜底，默认开）。

## 打包
- `python3 tools/meng_pack.py stickers-tieba` → `dist/stickers-tieba-v<version>.meng`

## 机制
- 与 stickers 插件同：`{image}` 格子 → IMAGE_COMMIT → commitImage 直插；失败按设置弹分享（精确 MIME，不转码）
- **单包平铺**：plugin.js 把所有 packs 的 images 合并成一个 grid，不显示 tab 头（表情包的语义就是一个包）

## 升级注意
- manifest `version` +1；93 张图全部要在 data.json 里声明才会显示