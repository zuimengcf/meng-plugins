# 本地词典（smart-dict）

47 万条离线词典：面板打开自动查输入框全文，点按词条替换全文并上屏释义。

## 文件
- `plugin/dict_*.txt` — 词库 TSV（word\tdef）：hot/cn/en/game/acg/person/ai/brand/net/main
- `plugin/plugin.js` — 结果渲染（宿主搜索，脚本只画 UI）
- `plugin/manifest.json` — dict.defSearch: true（释义也纳入匹配）

## 怎么改

**加词库文件**：dict_新类.txt（word\tdef 每行一条），manifest 不用改（宿主自动发现 dict_*.txt）。

**改渲染**：plugin.js 的 renderPanel——词条格子 `{text: word, commit: REPLACE + word + "\n" + def}`。

**重建词库**：`python3 tools/meng_pack.py smart-dict`（打包成 .meng）。

## 机制
- 搜索在**宿主侧**（SQLite 索引，毫秒级），结果经 `ctx.results` [{word, def}] 注入脚本
- 大词库不进脚本沙箱，避免 QuickJS 负载
- 点按 = REPLACE 通道完整替换输入框为「词条\n释义」

## 升级注意
- 词库改动必须重打包（tools/meng_pack.py）；manifest `version` +1
- TSV 制表符分隔，UTF-8；空行自动跳过
- 词库构建脚本与 frost 源数据在工作区 `plugins-tools/smart-dict-ref/`（analyze_hot/check_dedup/merge_hot/parse_scel/rebuild_frost/repack/split_dict 等），不在插件包内