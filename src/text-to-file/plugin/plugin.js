// 文本转文件面板：把输入框内容（空则剪贴板最新内容）导出为 txt/md/html 文件。
// 点按走宿主 EXPORT_PREFIX 通道（\uE000EXPORT\uE000 + JSON），
// 宿主读全文写 files/documents/ 并弹系统分享。脚本只做 UI 与格式判定。
var EXPORT = "\uE000EXPORT\uE000";

// —— 智能识别 Markdown 语法 ——
function looksLikeMarkdown(s) {
  var re = /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|[-*_]\s*[-*_]\s*[-*_])/;
  var tableRe = /(^|\n)\s*\|?.+\|.+\|\s*\n\s*\|?[\s:|-]+\|[\s:|-]+\|/;
  return re.test(s) || tableRe.test(s);
}

// —— 智能识别 HTML 语法 ——
function looksLikeHtml(s) {
  var re = /(^|\n)\s*<(html|!DOCTYPE|div|p|span|h[1-6]|ul|ol|li|table|tr|td|th|a|img|br|section|article|blockquote)[\s>/]/i;
  return re.test(s);
}

function renderPanel(query, ctx) {
  var settings = (ctx && ctx.settings) || {};
  var defaultFormat = settings.defaultFormat || "auto";
  var text = (query || "").trim();

  function autoFormat(t) {
    if (looksLikeHtml(t)) return "html";
    if (looksLikeMarkdown(t)) return "md";
    return "txt";
  }

  var chosen = defaultFormat === "auto" ? autoFormat(text) : defaultFormat;
  var brief = text.length > 14 ? text.slice(0, 14) + "…" : text;

  var cells = [];
  // 自动识别建议行（点按直接按建议格式导出）；来源：输入框/剪贴板
  var src = text ? "输入框：" : "剪贴板：";
  cells.push({
    text: src + (brief || "空") + "  →  " + chosen,
    commit: EXPORT + '{"format":"' + chosen + '"}'
  });
  // 三个格式按钮
  var labels = [["纯文本 txt", "txt"], ["Markdown md", "md"], ["HTML html", "html"]];
  labels.forEach(function (l) {
    cells.push({
      text: l[0],
      commit: EXPORT + '{"format":"' + l[1] + '"}'
    });
  });

  return { type: "grid", cols: 1, cells: cells };
}
