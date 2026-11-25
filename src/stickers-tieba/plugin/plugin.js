// 贴吧表情包面板：93 张 webp 直接平铺展示（无 tab 头），点按直插发送。
// 图片文件放插件安装目录（files/plugins/stickers-tieba/），声明放 data.json 的 stickers.packs。
// 渲染：图片格子 {image: 文件名}（宿主 v1.1 渲染器支持），点按走 IMAGE_COMMIT 前缀 →
// 宿主窗口层拼绝对路径 → commitImage 图片直插。
function renderPanel(query, ctx) {
  var data = {};
  try {
    data = (typeof __DATA__ !== "undefined" && __DATA__) || {};
    if (typeof data === "string") data = JSON.parse(data);
  } catch (e) { data = {}; }
  var packs = (data.stickers && data.stickers.packs) || [];
  var images = [];
  packs.forEach(function (p) {
    images = images.concat(p.images || []);
  });
  if (!images.length) {
    return {
      type: "label",
      text: "贴纸包为空：把图片放进插件目录，并在 data.json 的 stickers.packs 里声明",
      size: 15
    };
  }
  // 表情包：整包平铺一个 grid，不显示 tab 头
  return {
    type: "grid",
    cols: 4,
    cells: images.map(function (name) {
      return { image: name };
    })
  };
}
