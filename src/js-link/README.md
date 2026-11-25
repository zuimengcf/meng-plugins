# 链接工具（link-tools）

URL 净化 + 链接提取二合一（粘贴变换型）。

## 文件
- `plugin/plugin.js` — 双模式逻辑（transform 入口）
- `plugin/rules.json` — 规则数据：paramBlacklist/paramPatterns/domainRules/mirrorRules
- `plugin/manifest.json` — 设置（mode/mirrorMode/preserveFragment/repair）+ 自定义镜像菜单

## 工作模式（settings.mode）

| 值 | 行为 |
|----|------|
| clean | 净化 URL 追踪参数（默认）+ 可选镜像转发 |
| extract | 从混杂文本（emoji/汉字/零宽字符）提取纯链接 |

## 怎么改

**加追踪参数黑名单**：rules.json 的 `paramBlacklist` 数组加参数名。
```json
"paramBlacklist": ["_ga", "__hsfp", ...]
```

**加镜像规则**：rules.json 的 `mirrorRules`（如 `x.com → fixupx.com`）；用户自定义镜像在插件详情「自定义链接镜像」菜单编辑（宿主存储，覆盖/追加内置）。

**改混淆修复表**：plugin.js 的 `OBFUSCATE` 对象（数学字母 → ASCII）。

**加域名规则**：rules.json 的 `domainRules`。

## 打包
- `python3 tools/meng_pack.py link-tools` → `dist/link-tools-v<version>.meng`

## 机制
- PasteTransform：粘贴时宿主调 `transform(text, ctx)`；ctx 含 rules/customMirror/settings
- 防爬混淆修复（settings.repair）：𝑎𝑏𝑐 数学字母→abc 后重提取（settings.repair 开）
- 保留 # 片段：settings.preserveFragment

## 升级注意
- manifest `version` +1；rules.json 是数据驱动——改规则不用动逻辑
- 黑名单大小写敏感（参数名精确匹配）
- 规则数据在 `plugin/rules.json`，规则生成工具在工作区 `plugins-tools/link-rules-tools/`（build_rules.py 等）