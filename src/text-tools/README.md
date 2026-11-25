# 文本工具（text-tools）

粘贴变换工具集：拼音标注/繁简互转/摩斯电码/数字转中文/公历农历/年号换算，独立开关可叠加。

## 文件
- `plugin/plugin.js` — 变换逻辑（transform 入口）
- `plugin/data.json` — s2t/t2s 全量繁简映射、morse 表、lunar 农历表、era 年号表
- `plugin/pinyin.json` — 汉字→拼音表（__PINYIN__ 注入）
- `plugin/manifest.json` — 12 个设置项（quick 开关支持状态区长按快切）

## 怎么改

**加变换**：plugin.js 写新函数，`transform()` 按开关顺序调用；manifest settings 加开关（`"quick": true` 可快切）。

**改数据表**：data.json 对应键（如 morse 表加字符）；繁简映射改动需全量重测。

**开关叠加顺序**：transform 里函数调用顺序决定处理顺序（annotate → s2t → morse → num2cn → calendar → era）。

## 机制
- PasteTransform 管线：粘贴时宿主调 `transform(text, ctx)`，ctx.settings 读开关（"true"/"false"）
- 多开关同开按固定顺序串联；返回原文=该步不处理
- ⚡单次模式：功能关+单次开 → 下次粘贴生效一次自动回常闭（宿主通用能力）

## 升级注意
- manifest `version` +1；数据文件大（data.json ~2MB），打包走 `python3 tools/meng_pack.py text-tools`
- 拼音表改动影响标注质量，先小样测试