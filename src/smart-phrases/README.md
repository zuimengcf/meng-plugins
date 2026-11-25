# 高级短语（smart-phrases）

定式文短语面板：输入框内容当变量嵌入句式，点按上屏整句（所见即所得）。

## 文件
- `plugin/plugin.js` — 句式数据 + 渲染
- `plugin/manifest.json` — 设置（pricePerToken）+ 短语模板说明菜单

## 占位符（脚本约定）

| 占位符 | 求值 |
|--------|------|
| {X} | 输入框全文 |
| {X1} {X2} | 输入框按空白切分第 1/2 词 |
| {time:格式} {date} {now} | 宿主时间占位符（点按时刻） |
| {count} {tokens} | 字数 / AI token 估算 |
| {editor} | 输入框全文（同 {X}） |
| {rand:n} {rand:alnum:n} | 随机 token |

## 怎么改

**加句式**：plugin.js 对应分类的句式数组加字符串。
```js
"昨天，{X}获得诺贝尔搞笑奖提名",
```

**加分类**：tabs 数组加 `tab("分类名", grid(...))`。

**计费单价**：插件设置 `pricePerToken`（元），宿主注入 `ctx.settings.pricePerToken`。

## 打包
- `python3 tools/meng_pack.py smart-phrases` → `dist/smart-phrases-v<version>.meng`

## 机制
- 点按 commit 常含宿主占位符，宿主 PluginPanelEvaluator 在**点按时刻**求值上屏
- 定式文走 REPLACE（完整替换输入框）或普通 commit（光标插入），看格子声明
- 预览文本即求值后成品句，点按与所见一致

## 升级注意
- manifest `version` +1；句式里别用未定义占位符（原样上屏）
- 时间占位符在显示预览时就求值一次，点按时再求最新值，秒级场景一致