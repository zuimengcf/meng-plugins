// 贴纸包面板：本地图片贴纸按分类展示，点按直插发送。
// 图片文件放插件安装目录（files/plugins/stickers/），stickers.json 声明分类与文件名：
//   { "packs": [ { "label": "表情", "images": ["heart.png", "smile.png"] }, ... ] } 
// 脚本无文件系统访问，靠 __DATA__ 全局变量读声明（data.json 同款注入机制，此处用 stickers.json
// ——宿主按文件名约定注入 data.json，所以贴纸声明放 data.json 里的 stickers 键）。
// 渲染：图片格子 {image: 文件名}（宿主 v1.1 渲染器支持），点按走 IMAGE_COMMIT 前缀 →
// 宿主窗口层拼绝对路径 → commitImage 图片直插。

function renderPanel(query, ctx) {
  // __DATA__ = data.json 内容（宿主注入为对象；兼容字符串形式）
  var data = {};
  try {
    data = (typeof __DATA__ !== "undefined" && __DATA__) || {};
    if (typeof data === "string") data = JSON.parse(data);
  } catch (e) { data = {}; }
  var packs = (data.stickers && data.stickers.packs) || [];

  if (!packs.length) {
    return {
      type: "label",
      text: "贴纸包为空：把图片放进插件目录，并在 data.json 的 stickers.packs 里声明",
      size: 15
    };
  }

  // 每个 pack 一个 tab，body 是图片 grid
  var tabs = packs.map(function (p) {
    return {
      label: p.label,
      body: {
        type: "grid",
        cols: 4,
        cells: p.images.map(function (name) {
          return { image: name };
        })
      }
    };
  });

  return { type: "tabs", tabs: tabs };
}