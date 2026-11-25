# 梦输入法 · 插件开发指南

本文面向想修改/开发插件的用户。所有插件都是纯文本文件（manifest.json + plugin.js + 可选数据文件），改完重新打包 `.meng`（本质是 zip）导入即可。

## 插件结构

```
my-plugin/plugin/
├── manifest.json    # 插件声明：id/名称/设置项/菜单
├── plugin.js        # 脚本逻辑（QuickJS 沙箱，标准 ECMAScript）
├── data.json        # 可选：大数据（全局变量 __DATA__ 注入）
└── pinyin.json      # 可选：拼音表（全局变量 __PINYIN__ 注入）
```

打包：`python3 tools/meng_pack.py <插件目录名>`（自动出包 `dist/<id>-v<版本>.meng` 并登记指纹台账；`all` 打全部）

## 完整性与发布流程
- 每次打包自动计算**内容指纹**（条目按名排序，逐条 `name:sha256` 拼接后整体 sha256）并追加到 `dist/RELEASES.tsv` 台账
- 打包为**可复现构建**（固定 zip 时间戳）：源码不变 → 产物字节级不变，指纹稳定
- 正式发布某版本时，从台账取该版本的指纹写入宿主内置官方指纹表；用户侧校验重算指纹比对，命中即证明包未被修改，未命中标「第三方」

## manifest.json 字段

| 字段 | 说明 |
|------|------|
| id | 全局唯一（英文小写+短横），冲突拒载 |
| name | 显示名 |
| version | 整数，升级时+1 |
| apiVersion | 固定 1 |
| type | `script`（脚本插件） |
| action | `panel`=面板 / `settings`=仅设置 / `clean`/`extract`/`annotate`=粘贴变换 |
| ui | `frame`（面板用，固定） |
| hooks | panel 插件写 `[]`；粘贴变换写 `["PasteTransform"]` |
| icon | 宿主内置图标名：mood/text_format/language/tune/description/auto_awesome/library_books/format_quote/emoji_symbols |
| priority | 越大越先执行（粘贴管线），默认 100 |
| settings | 设置项数组（见下） |
| menus | 注册菜单项（自定义规则等，编辑器） |
| description | 插件描述 |

## settings 设置项

```json
{
  "key": "tone",              // 键（插件内唯一）
  "label": "带声调",           // 显示名
  "type": "switch",           // switch / select / text
  "defaultValue": "true",     // switch 为 "true"/"false"
  "options": ["a|选项A", "b|选项B"],  // select 用："值|标签"
  "quick": true               // 可选：状态区「更多」长按快速切换
}
```

宿主存储设置值，运行时经 `ctx.settings.<key>` 注入脚本；升级插件不丢配置。

## 宿主通用 API（全部插件可用）

### 1. 面板渲染（action=panel）

定义全局函数 `renderPanel(query, ctx)`，返回声明式 UI 树 JSON：

```js
function renderPanel(query, ctx) {
  // query = 当前输入框全文（宿主注入）
  // ctx.settings = 本插件设置值（字符串）
  // ctx.results = 宿主侧词典搜索结果 [{word, def}]（无 dict 则为空）
  return {
    type: "tabs",   // 或 "grid" / "label"
    tabs: [{ label: "分类", body: { type: "grid", cols: 4, cells: [...] } }]
  };
}
```

组件：
- `{type:"label", text:"...", size:15}` — 文本行
- `{type:"grid", cols:n, cells:[{text, commit}]}` — 按钮格子
- `{type:"tabs", tabs:[{label, body}]}` — 分类页（tab 头高亮切换）

### 2. commit 值语义（点按行为）

| commit 值 | 行为 |
|-----------|------|
| 普通文本 | 插入当前输入框光标处 |
| `\uE000REPLACE\uE000`+文本 | **完整替换**输入框全文（词典/复读用） |
| `{image: "文件名"}` 格子 | 图片直插（IMAGE_COMMIT 前缀，宿主处理） |
| `\uE000EXPORT\uE000`+JSON | **通用导出**：宿主把输入框全文（空则剪贴板）写成文件并弹分享 |
| 含 `{editor}` `{count}` `{time:格式}` `{date}` `{now}` `{rand:n}` `{rand:alnum:n}` `{tokens}` | 宿主占位符求值后再上屏 |

EXPORT JSON 参数：
```json
{"format":"md", "name":"可选文件名"}
```
format 支持 `txt` / `md` / `html`（html 自动套文档骨架）。

### 3. 数据注入（全局变量）

- `__DATA__` — data.json 内容（对象；脚本无文件系统访问，靠这个读大数据）
- `__PINYIN__` — pinyin.json（键=汉字，值=拼音）

### 4. 粘贴变换（action=clean/extract/annotate）

定义 `transform(text, ctx)` 返回处理后的文本；返回原文=不处理。
ctx 含 `isUrlField`/`isEmailField`/`isMultiline`/`targetPackage`/`settings`/`customMirror`。

### 5. 插件设置存取（宿主通用）

设置值宿主存储，脚本只经 `ctx.settings` 读；自定义规则/镜像经 `ctx.customMirror` 与插件菜单编辑器读写。

## 参考插件

| 插件 | 学什么 |
|------|--------|
| repeater | 最小面板：REPLACE 替换通道 |
| art-symbols | tabs + grid 组合，大数据内嵌脚本 |
| smart-dict | 宿主词典搜索 + REPLACE 点按 |
| smart-phrases | 占位符求值 + 设置注入 |
| stickers / stickers-tieba | 图片格子 + __DATA__ 声明 |
| text-tools | 多设置项 + __PINYIN__/__DATA__ + PasteTransform |
| text-to-file | EXPORT 导出通道 |
| js-link | 粘贴变换 + rules.json + 自定义镜像菜单 |
| tts-voice | 纯设置插件（action=settings） |

## 调试

- 日志：`adb logcat | grep -iE 'ScriptPlugin|PluginPanel'`
- 插件目录：`/data/data/com.meng.ime/files/plugins/<id>/`（改完重导入 .meng 即热加载）
- 失败状态：设置页插件列表显示「已熔断」（连续失败≥3），手动重新启用清零
