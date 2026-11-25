# 艺术字·符号面板（art-symbols）

多分类成品符号面板：氛围组合、爱心、网名装饰、颜文字等整串成品，点按上屏。

## 文件
- `plugin/plugin.js` — 全部数据内嵌（tab/grid 声明式 UI）
- `plugin/manifest.json` — 声明（v7 二级分类：五大类 → 23 个子分类）

## 怎么改

**加符号**：plugin.js 对应分类的 grid 数组里加字符串。
```js
tab("氛围组", grid(3, [
  "₊˚⊹", "⋆˚✿˖°", "✧˚°.",   // 加一项就多一个格子
]))
```

**加分类**：一级 tabs 数组加 `tab("名称", {...})`；二级同理（body 里嵌 tabs）。

**改列数**：`grid(3, ...)` 第一个参数。

## 打包
- `python3 tools/meng_pack.py art-symbols` → `dist/art-symbols-v<version>.meng`

## 机制
- 一级 tab：成品装饰/单字符/数学/棋牌/表情；每类下二级 tab（原 23 分类全保留）
- 点按直接上屏符号文本（无前缀，普通 commit）
- 纯数据驱动：想加新主题（如「节日限定」）复制一个 tab 结构改内容即可

## 升级注意
- manifest `version` +1；数据全部内嵌 JS，文件别超 QuickJS 负载（当前 ~300KB 内没问题）
- 符号含特殊 Unicode 时确保文件保存为 UTF-8（无 BOM）