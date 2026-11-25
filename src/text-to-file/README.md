# 文本转文件（text-to-file）

把输入框内容（空则剪贴板最新文本）导出为 txt/md/html 文件并分享。

## 文件
- `plugin/manifest.json` — 声明（含 defaultFormat 设置）
- `plugin/plugin.js` — 面板 UI + 格式智能识别

## 怎么改

**加导出格式**：两处——plugin.js 格式按钮数组；宿主 `exportVia()` 的 when 分支（需改宿主重编译）。

**改识别规则**：plugin.js 的 `looksLikeMarkdown()` / `looksLikeHtml()` 正则。
```js
var re = /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|...)/;  // md 特征
```

**改列数**：`cols: 1`（单列大按钮）。

**设置项**：`defaultFormat`——auto（智能识别）/txt/md/html。

## 打包
- `python3 tools/meng_pack.py text-to-file` → `dist/text-to-file-v<version>.meng`

## 机制
- 点按 commit = `\uE000EXPORT\uE000` + `{"format":"md","name":"可选名"}` → 宿主 EXPORT 通道
- 宿主：输入框空则读剪贴板 → 写 files/documents/ → FileProvider → 系统分享
- html 自动套 `<!DOCTYPE html>` 骨架；txt/md 原文写入
- EXPORT 是**通用 API**：任何插件都能用（导出任意格式文件）

## 升级注意
- manifest `version` +1；识别正则改完记得用真实 md/html 文本测一遍