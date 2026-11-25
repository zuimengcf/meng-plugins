# 复读（repeater）

把输入框内容重复 N 次替换上屏。输入「我爱你」→ 点「×3」→ 全文替换为「我爱你我爱你我爱你」。

## 文件
- `plugin/plugin.js` — 全部逻辑（约 45 行，最小面板示例）

## 怎么改

**加/改倍数**：`plugin.js` 的 `mults` 数组（快速倍数）和 `big` 数组（大倍数）。
```js
var mults = [2, 3, 4, 5, 6, 7, 8, 9];  // 快速九连
var big = [10, 20];                     // 弹幕式大倍数
```

**改格子布局**：返回值 `cols`（列数）。

**改提示语**：空输入时返回的 label 文本。

## 打包
- `python3 tools/meng_pack.py repeater` → `dist/repeater-v<version>.meng`

## 机制
- 点按 commit = `\uE000REPLACE\uE000` + 重复文本 → 宿主 REPLACE 通道**完整替换**输入框全文
- 空输入：显示提示 label，不提供点按

## 升级注意
- manifest.json 的 `version` +1 再打包，宿主才识别为升级
- 重复 20 次长文本可能超出输入框容量，接收 App 自行截断，属正常