// 复读面板：把输入框内容重复 N 次替换上屏。
// 输入「我爱你」→ 打开面板点「×3」→ 输入框全文替换为「我爱你我爱你我爱你」。
// 走宿主 REPLACE_PREFIX 通道（完整替换输入框），与词典插件同款交互。

var REPLACE = "\uE000REPLACE\uE000";

function renderPanel(query, ctx) {
  var text = (query || "").trim();

  // 空输入：提示先输入
  if (!text) {
    return {
      type: "label",
      text: "输入框为空：先打几个字，再打开复读面板",
      size: 15
    };
  }

  // 输入预览 + 倍数格子
  var brief = text.length > 8 ? text.slice(0, 8) + "…" : text;

  // 倍数：×2 到 ×9，快速九连
  var mults = [2, 3, 4, 5, 6, 7, 8, 9];
  var cells = mults.map(function (n) {
    var repeated = new Array(n + 1).join(text);
    return {
      text: "×" + n,
      commit: REPLACE + repeated
    };
  });

  // 长按场景补充：×10 / ×20 大倍数（弹幕式刷屏）
  var big = [10, 20];
  big.forEach(function (n) {
    var repeated = new Array(n + 1).join(text);
    cells.push({
      text: "×" + n,
      commit: REPLACE + repeated
    });
  });

  return {
    type: "grid",
    cols: 5,
    cells: cells
  };
}