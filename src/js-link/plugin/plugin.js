/*
 * 链接工具 · JS 版（合并原「剪贴板净化」+「链接提取器」）
 *
 * 两种工作模式（manifest.settings.mode）：
 *   clean   净化 URL 追踪参数 + 可选镜像转发（原 js-purifier）
 *   extract 从混有 emoji/汉字/干扰符/零宽字符的文本中提取纯链接（原 js-extractor）
 *
 * 数据驱动：
 *   ctx.rules.paramBlacklist / paramPatterns / domainRules / mirrorRules（来自 rules.json）
 *   ctx.customMirror  用户自定义镜像映射（覆盖/追加内置）
 *
 * 设置在 manifest.settings（宿主注入 ctx.settings，字符串）：
 *   mode             clean / extract
 *   preserveFragment "true"/"false" 保留 # 片段（clean）
 *   mirrorMode       replace / off / append（clean 的镜像）
 *   repair           "true"/"false" 防爬混淆修复（extract）
 */

var URL_REGEX = /https?:\/\/[^\s"'<>()]+/g;

// 零宽与不可见字符
var ZW = "\u200B\u200C\u200D\uFEFF\u2060";

// 防爬混淆数学字母 → ASCII
var OBFUSCATE = {
  "𝑎": "a", "𝑏": "b", "𝑐": "c", "𝑑": "d", "𝑒": "e", "𝑓": "f",
  "𝑔": "g", "𝑕": "h", "𝑖": "i", "𝑗": "j", "𝑘": "k", "𝑙": "l",
  "𝑚": "m", "𝑛": "n", "𝑜": "o", "𝑝": "p", "𝑞": "q", "𝑟": "r",
  "𝑠": "s", "𝑡": "t", "𝑢": "u", "𝑣": "v", "𝑤": "w", "𝑥": "x",
  "𝑦": "y", "𝑧": "z"
};

// 取 URL 的 host（不含端口与路径）
function hostOf(url) {
  var m = /^https?:\/\/([^\/?#]+)/.exec(url);
  return m ? m[1] : null;
}

// 构建镜像映射：内置 mirrorRules + 用户自定义覆盖/追加
function buildMirrorMap(rules, customMirror) {
  var m = {};
  if (rules && rules.mirrorRules) {
    for (var k in rules.mirrorRules) {
      if (rules.mirrorRules.hasOwnProperty(k)) m[k] = rules.mirrorRules[k];
    }
  }
  if (customMirror) {
    for (var ck in customMirror) {
      if (customMirror.hasOwnProperty(ck)) m[ck] = customMirror[ck];
    }
  }
  return m;
}

// 在 map 中查 source 的镜像目标：先精确匹配完整 host，再匹配去 www 的基础域
function lookupMirror(map, host) {
  if (!host) return null;
  if (map[host]) return { target: map[host], matchedHost: host };
  var base = host.replace(/^www\./, '');
  if (base !== host && map[base]) return { target: map[base], matchedHost: base };
  return null;
}

// 用目标域替换 URL 中匹配到的源 host
function replaceHost(url, matchedHost, targetHost) {
  var idx = url.indexOf(matchedHost);
  if (idx < 0) return url;
  return url.substring(0, idx) + targetHost + url.substring(idx + matchedHost.length);
}

// ===== 模式一：净化（原 js-purifier）=====

// 净化单个 URL 的追踪参数；返回净化后的 URL（无变化则原样）
function cleanUrl(url, rules, keepFrag) {
  var q = url.indexOf('?');
  if (q < 0) return url;
  var base = url.substring(0, q);
  var query = url.substring(q + 1);
  var fragIdx = query.indexOf('#');
  var frag = fragIdx >= 0 ? query.substring(fragIdx) : "";
  var queryPart = fragIdx >= 0 ? query.substring(0, fragIdx) : query;
  var params = queryPart.split('&').filter(function (p) { return p.length > 0; });

  var bl = {};
  if (rules && rules.paramBlacklist) {
    for (var i = 0; i < rules.paramBlacklist.length; i++) bl[rules.paramBlacklist[i]] = true;
  }
  var patterns = (rules && rules.paramPatterns) ? rules.paramPatterns : [];
  var host = hostOf(url);
  var domRules = null;
  if (rules && rules.domainRules) {
    var hostBase = host ? host.replace(/^www\./, '') : null;
    if (hostBase && rules.domainRules[hostBase]) domRules = rules.domainRules[hostBase];
    else if (host && rules.domainRules[host]) domRules = rules.domainRules[host];
  }
  if (domRules) {
    for (var d = 0; d < domRules.length; d++) bl[domRules[d]] = true;
  }

  function isTracker(key) {
    if (bl[key] === true) return true;
    for (var p = 0; p < patterns.length; p++) {
      if (key.match(patterns[p])) return true;
    }
    return false;
  }

  var kept = [];
  for (var j = 0; j < params.length; j++) {
    var eq = params[j].indexOf('=');
    var key = params[j].substring(0, eq >= 0 ? eq : params[j].length);
    if (!isTracker(key)) kept.push(params[j]);
  }
  if (kept.length === params.length) return url;
  var qNew = kept.join('&');
  return base + (qNew.length > 0 ? '?' + qNew : '') + (keepFrag ? frag : "");
}

// 净化整段文本（含镜像 replace/append）
function cleanTransform(text, settings, rules, customMirror) {
  var keepFrag = (settings.preserveFragment !== "false");
  var mirrorMode = settings.mirrorMode || "off";
  var map = buildMirrorMap(rules, customMirror);
  var changed = false;
  var outArr = [];
  var lastIndex = 0;

  URL_REGEX.lastIndex = 0;
  var m;
  while ((m = URL_REGEX.exec(text)) !== null) {
    outArr.push(text.substring(lastIndex, m.index));
    var url = m[0];
    var cleaned = cleanUrl(url, rules, keepFrag);
    var applied = cleaned;
    if (mirrorMode === "replace") {
      var hit = lookupMirror(map, hostOf(cleaned));
      if (hit) applied = replaceHost(cleaned, hit.matchedHost, hit.target);
    } else if (mirrorMode === "append") {
      var hit2 = lookupMirror(map, hostOf(cleaned));
      if (hit2) applied = cleaned + "\n" + replaceHost(cleaned, hit2.matchedHost, hit2.target);
    }
    if (applied !== url) changed = true;
    outArr.push(applied);
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) URL_REGEX.lastIndex++;
  }
  outArr.push(text.substring(lastIndex));
  var out = outArr.join("");
  return changed ? out : text;
}

// ===== 模式二：提取（原 js-extractor）=====

// 剔除 URL 段里的非 ASCII 可见字符（汉字/emoji/零宽等干扰）
function stripHanFromUrl(url) {
  return url.replace(/[^\x20-\x7E]/g, "");
}

// 防爬修复整段文本
function repairObfuscated(text) {
  var t = text;
  for (var i = 0; i < ZW.length; i++) {
    t = t.split(ZW.charAt(i)).join("");
  }
  t = t.replace(/hxxps:\/\//gi, "https://").replace(/hxxp:\/\//gi, "http://");
  for (var k in OBFUSCATE) {
    if (OBFUSCATE.hasOwnProperty(k)) t = t.split(k).join(OBFUSCATE[k]);
  }
  return t;
}

// 尝试从文本提取所有链接
function extractFromText(text) {
  var matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return null;
  var cleaned = matches.map(stripHanFromUrl);
  var joined = cleaned.join("\n");
  if (joined === text) return null; // 已是纯链接不动
  return joined;
}

function extractTransform(text, settings) {
  var repair = (settings.repair !== "false"); // 默认 true
  var direct = extractFromText(text);
  if (direct !== null) return direct;
  if (repair) {
    var repaired = repairObfuscated(text);
    if (repaired !== text) {
      var retry = extractFromText(repaired);
      if (retry !== null) return retry;
    }
  }
  return text; // 无链接可提取，原样返回（宿主判定 ==text 则 NotHandled）
}

// ===== 入口 =====
function transform(text, ctx) {
  if (typeof text !== "string" || text.length === 0) return text;
  ctx = ctx || {};
  var settings = ctx.settings || {};
  var rules = (typeof __RULES__ !== "undefined") ? __RULES__ : null;
  var mode = settings.mode || "clean";

  if (text.indexOf("http") < 0 && mode === "clean") return text; // clean 需先有 http

  if (mode === "extract") {
    return extractTransform(text, settings);
  }
  return cleanTransform(text, settings, rules, ctx.customMirror);
}