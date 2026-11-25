// 语音参数插件：仅提供设置项（语速/音调/引擎），宿主 TtsAudioCommit 读取生效。
// 无面板/管线功能，设置变更在下次合成时生效。
function renderPanel() {
  return {
    type: "label",
    text: "语音参数请在插件的「设置」中调整\n（长按状态栏本插件图标 → 打开插件设置）",
    size: 15
  };
}