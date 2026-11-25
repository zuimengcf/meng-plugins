# 语音参数（tts-voice）

文字转语音的合成参数设置。插件本身无面板逻辑，只声明设置项；宿主 TtsAudioCommit 读取生效。

## 文件
- `plugin/manifest.json` — 5 个设置项声明
- `plugin/plugin.js` — 仅返回提示 label（指向设置入口）

## 设置项（宿主读取的键）

| key | 作用 | 默认 |
|-----|------|------|
| rate | 语速（宿主读为 float，限 0.25~4.0） | 0.7 |
| pitch | 音调（限 0.25~4.0） | 1.0 |
| engine | TTS 引擎包名（留空用系统默认） | 空 |
| oggExt | 输出改 .ogg 扩展名（内容仍为 wav 数据，伪装语音格式） | false |
| shareFallback | 直插失败时弹分享 | true |

## 怎么改

**加/改选项**：manifest 的 `settings` 数组。select 用 `"值|标签"` 格式。

**新参数生效**：宿主 `TtsAudioCommit.kt` 的 `loadVoiceParams()`/`loadOutputExt()` 读这些键——加新参数需同步改宿主读取逻辑，改完重新编译 APK。

## 打包
- `python3 tools/meng_pack.py tts-voice` → `dist/tts-voice-v<version>.meng`

## 机制
- 设置值宿主存储（插件升级不丢）；宿主在每次合成前读取
- 本插件是「插件存参数、宿主执行」模式的标准示例