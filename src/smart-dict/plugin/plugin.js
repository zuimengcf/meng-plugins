/*
 * 本地词典 · JS 版
 *
 * 面板型插件（action=panel, ui=frame）。宿主打开面板时：
 *  1) 读取当前输入框全文作为查询词 query；
 *  2) 在宿主侧 dict.txt（中英全量 108 万条 TSV：成语/词语/歇后语/英文）中做子串搜索，
 *     得到 results JSON 数组；
 *  3) 调用本脚本 renderPanel(query, ctx)，ctx.results = [{word, def}, ...]。
 *
 * 本脚本只负责把结果渲染成宿主统一基础组件（label/grid），
 * 并处理「无查询词 / 无结果」等提示态；数据搜索在宿主侧完成。
 *
 * 点按词条：commit 上屏「词条 + 释义」全文。
 */

function renderPanel(query, ctx) {
  ctx = ctx || {};
  var results = ctx.results || [];
  var q = (query || "").trim();

  // 无查询词
  if (!q) {
    return {
      type: "label",
      text: "请先在输入框输入要查询的词（中文/英文均可），再打开本词典面板。",
      size: 15
    };
  }

  // 无结果
  if (!Array.isArray(results) || results.length === 0) {
    return {
      type: "label",
      text: "未找到与「" + q + "」相关的词条。",
      size: 15
    };
  }

  // 有结果：逐条渲染为可点按词条（grid 单列）
  // 点按 = 完整替换输入框全文（REPLACE_PREFIX 前缀，宿主识别后走替换通道），
  // 避免"插入"导致词条与输入框原词重复（如输入"加油"点"加油"→"加油加油…"）。
  var REPLACE = "\uE000REPLACE\uE000";
  var cells = results.map(function (r) {
    var word = (r.word || "").trim();
    var def = (r.def || "").trim();
    var text = word;
    if (def) text = word + "\n" + def;
    return { text: word, commit: REPLACE + text };
  });

  return {
    type: "grid",
    cols: 1,
    cells: cells
  };
}