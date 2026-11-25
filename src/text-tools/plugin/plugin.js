/*
 * 文本工具 · JS 版（原「拼音标注」扩充）
 *
 * 工作模式（manifest.settings 独立开关，ctx.settings 内 "true"/"false" 字符串）：
 *   每个模式可独立开关、可并行叠加；开启的模式按固定顺序依次作用在文本上：
 *     enableAnnotate 拼音标注：给汉字注音 字(拼音)（默认开）
 *     enableS2t      简体转繁体（OpenCC 全量单字+词组）
 *     enableT2s      繁体转简体
 *     enableMorse    摩斯电码：字母/数字 → .- 序列
 *     enableMorseDecode 摩斯解码：.- 序列 → 字母/数字（含 ·− 变体）
 *     enableNum2cn   数字转中文（支持大小写，settings.cnCase: lower/upper）
 *     enableCalendar 公历转农历 + 天干地支 + 生肖
 *     enableEra      年号转换：13xx-19xx → 康熙xx年 等
 *
 * 数据来源（宿主引擎增强，全局变量，一次 load 常驻）：
 *   __PINYIN__   pinyin.json（键=汉字，值=拼音）
 *   __DATA__     data.json（s2t/t2s 全量繁简、morse、lunar 农历表、era 年号表）
 *
 * 设置（ctx.settings，字符串）：
 *   enableAnnotate "true"/"false"  拼音标注开关（默认 "true"）
 *   enableS2t / enableT2s          繁简转换开关（默认 "false"）
 *   enableMorse / enableNum2cn     摩斯/数字开关（默认 "false"）
 *   enableCalendar / enableEra     农历/年号开关（默认 "false"）
 *   tone     "true"/"false"  带声调（annotate）
 *   onlyRare "true"/"false"  只注生僻字（annotate）
 *   cnCase   lower/upper     数字转中文大小写（num2cn）
 *   morseSep space/slash     摩斯分隔符（morse）
 */

var URL_REGEX = /https?:\/\/[^\s"'<>()]+/g;

// 汉字区段（与 Kotlin isHan 对齐）
function isHan(cp) {
  return (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0x20000 && cp <= 0x2A6DF) ||
    (cp >= 0x2A700 && cp <= 0x2EBEF) ||
    (cp >= 0x30000 && cp <= 0x323AF);
}

// ================= 拼音标注（原功能） =================

var TONE_MAP = {
  "ā": "a", "á": "a", "ǎ": "a", "à": "a",
  "ē": "e", "é": "e", "ě": "e", "è": "e",
  "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
  "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
  "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
  "ǖ": "v", "ǘ": "v", "ǚ": "v", "ǜ": "v", "ü": "v",
  "ń": "n", "ň": "n", "ǹ": "n", "ñ": "n",
  "Ā": "A", "Á": "A", "Ǎ": "A", "À": "A",
  "Ē": "E", "É": "E", "Ě": "E", "È": "E",
  "Ī": "I", "Í": "I", "Ǐ": "I", "Ì": "I",
  "Ō": "O", "Ó": "O", "Ǒ": "O", "Ò": "O",
  "Ū": "U", "Ú": "U", "Ǔ": "U", "Ù": "U",
  "Ǖ": "V", "Ǘ": "V", "Ǚ": "V", "Ǜ": "V", "Ü": "V"
};

function stripTone(py) {
  var out = "";
  for (var i = 0; i < py.length; i++) {
    var c = py.charAt(i);
    out += TONE_MAP[c] !== undefined ? TONE_MAP[c] : c;
  }
  return out;
}

function annotateSegment(seg, table, tone, onlyRare) {
  var out = "";
  var changed = false;
  var i = 0;
  while (i < seg.length) {
    var cp = seg.codePointAt(i);
    var ch = String.fromCodePoint(cp);
    var chLen = ch.length;
    if (isHan(cp)) {
      var py = table[ch];
      if (py !== undefined) {
        if (onlyRare && cp < 0xA000) {
          out += ch;
        } else {
          out += ch + "(" + (tone ? py : stripTone(py)) + ")";
          changed = true;
        }
      } else {
        out += ch;
      }
    } else {
      out += ch;
    }
    i += chLen;
  }
  return { text: out, changed: changed };
}

function annotateTransform(text, settings, pinyin) {
  if (!pinyin) return text;
  var tone = (settings.tone !== "false");
  var onlyRare = (settings.onlyRare === "true");
  var sb = "";
  var changed = false;
  var cursor = 0;
  URL_REGEX.lastIndex = 0;
  var m;
  while ((m = URL_REGEX.exec(text)) !== null) {
    var pre = annotateSegment(text.substring(cursor, m.index), pinyin, tone, onlyRare);
    sb += pre.text; changed = changed || pre.changed;
    sb += m[0];
    cursor = m.index + m[0].length;
    if (m[0].length === 0) URL_REGEX.lastIndex++;
  }
  var tail = annotateSegment(text.substring(cursor), pinyin, tone, onlyRare);
  sb += tail.text; changed = changed || tail.changed;
  return changed ? sb : text;
}

// ================= 繁简转换（OpenCC 全量） =================

// 构建「按 key 长度分组」的索引：{len: {word: conv}}，load 后一次构建常驻。
// 转换时对每个位置从最长 len 向下取 substring 查表（O(1)），避免全表扫描。
var __CONV_INDEX__ = {};

function buildConvIndex(map) {
  var byLen = {};
  var maxLen = 0;
  for (var k in map) {
    if (!map.hasOwnProperty(k)) continue;
    var l = k.length;
    if (l === 0) continue;
    if (l > maxLen) maxLen = l;
    if (!byLen[l]) byLen[l] = {};
    byLen[l][k] = map[k];
  }
  return { byLen: byLen, maxLen: maxLen };
}

function getConvIndex(map) {
  // 索引直接挂在 map 对象上（s2t/t2s 各自独立，互不覆盖）
  if (!map.__convIdx) map.__convIdx = buildConvIndex(map);
  return map.__convIdx;
}

function convertScript(text, map) {
  if (typeof map !== "object" || map === null) return text;
  var idx = getConvIndex(map);
  var out = "";
  var i = 0;
  var changed = false;
  while (i < text.length) {
    var matched = false;
    var maxTry = Math.min(idx.maxLen, text.length - i);
    for (var l = maxTry; l >= 1; l--) {
      var bucket = idx.byLen[l];
      if (!bucket) continue;
      var sub = text.substring(i, i + l);
      if (bucket.hasOwnProperty(sub)) {
        out += bucket[sub];
        i += l;
        matched = true;
        changed = true;
        break;
      }
    }
    if (!matched) {
      // 无法匹配：保留当前码点（正确处理代理对）
      var cp = text.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      out += ch;
      i += ch.length;
    }
  }
  return changed ? out : text;
}

// s2t/t2s 合并后的完整映射（单字 + 词组），惰性构建一次常驻
function s2tMap(data) {
  if (!data || !data.s2t) return {};
  if (!s2tMap.__m) {
    var m = {};
    for (var k in data.s2t) if (data.s2t.hasOwnProperty(k)) m[k] = data.s2t[k];
    if (data.s2tPh) for (var k2 in data.s2tPh) if (data.s2tPh.hasOwnProperty(k2)) m[k2] = data.s2tPh[k2];
    s2tMap.__m = m;
  }
  return s2tMap.__m;
}
function t2sMap(data) {
  if (!data || !data.t2s) return {};
  if (!t2sMap.__m) {
    var m = {};
    for (var k in data.t2s) if (data.t2s.hasOwnProperty(k)) m[k] = data.t2s[k];
    if (data.t2sPh) for (var k2 in data.t2sPh) if (data.t2sPh.hasOwnProperty(k2)) m[k2] = data.t2sPh[k2];
    t2sMap.__m = m;
  }
  return t2sMap.__m;
}

// ================= 摩斯电码 =================

// 摩斯数字表（0-9）：data.json 的 morse 表只含 A-Z 字母，数字在此兜底补齐
var MORSE_DIGITS = {
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----."
};

function morseTransform(text, settings, morseTable) {
  if (!morseTable) return text;
  var sep = (settings.morseSep === "slash") ? "/" : " ";
  var out = "";
  var changed = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i).toUpperCase();
    var code = morseTable[ch];
    if (code === undefined && MORSE_DIGITS[ch] !== undefined) code = MORSE_DIGITS[ch];
    if (code !== undefined) {
      out += code + sep;
      changed = true;
    } else {
      out += ch; // 非字母/数字保留原文
    }
  }
  // 去掉末尾多余分隔符
  if (changed && out.length > 0 && out.charAt(out.length - 1) === sep) {
    out = out.substring(0, out.length - 1);
  }
  return changed ? out : text;
}

// ================= 摩斯电码解码 =================

// 摩斯码反查表：由 data.json 的 morse 表（A-Z）+ 数字表构建，惰性构建一次常驻
function morseDecodeTable(morseTable) {
  if (!morseDecodeTable.__t || morseDecodeTable.__src !== morseTable) {
    var t = {};
    for (var ch in morseTable) {
      if (morseTable.hasOwnProperty(ch)) t[morseTable[ch]] = ch;
    }
    for (var d in MORSE_DIGITS) {
      if (MORSE_DIGITS.hasOwnProperty(d)) t[MORSE_DIGITS[d]] = d;
    }
    morseDecodeTable.__t = t;
    morseDecodeTable.__src = morseTable;
  }
  return morseDecodeTable.__t;
}

// 解码摩斯电码：分隔符自动识别（空格/斜杠/连续符号间无分隔时按 3 长度切词不可靠，仅支持有分隔的输入）
// 字符分隔符：空格或 /；单词分隔符：连续两个以上分隔（空格）或 " / "
function morseDecodeTransform(text, settings, morseTable) {
  if (!morseTable) return text;
  var table = morseDecodeTable(morseTable);
  // 输入必须以 . - · − 组成（含分隔符），否则不处理
  if (!/^[.\-·−\s/]+$/.test(text.trim())) return text;
  var sep = (settings.morseSep === "slash") ? "/" : " ";
  var out = "";
  var changed = false;
  // 按字符分段：先用 / 或多个空格切词，词内单分隔切字符
  var words;
  if (text.indexOf("/") >= 0) {
    words = text.split("/").map(function (w) { return w.trim(); });
  } else {
    words = text.trim().split(/\s{2,}/);
  }
  for (var w = 0; w < words.length; w++) {
    if (w > 0) out += " ";
    var chars = words[w].split(/\s+/).filter(function (c) { return c.length > 0; });
    for (var c = 0; c < chars.length; c++) {
      var code = chars[c].replace(/·/g, ".").replace(/−/g, "-");
      var decoded = table[code];
      if (decoded !== undefined) {
        out += decoded;
        changed = true;
      } else {
        out += "?"; // 未知码组保留占位
        changed = true;
      }
    }
  }
  return changed ? out : text;
}

// ================= 摩斯编码/解码：隔离阶段 =================

// 判断输入是否为摩斯码（仅含 . - · − 空格 /），用于编码/解码自动分流
function isMorseLike(text) {
  var s = text.trim();
  if (s.length === 0) return false;
  // 必须以摩斯符号或分隔符组成（允许任意空格/斜杠）
  return /^[.\-·−\s/]+$/.test(s);
}

// 摩斯编码/解码隔离入口：一次只走一个方向，避免编码后解码（或反向）循环抵消。
//  仅编码：文字→摩斯码（摩斯码输入原样保留）
//  仅解码：摩斯码→文字（非摩斯码原样返回）
//  双开：输入摩斯码→解码，输入文字→编码（按内容自动分流，互不干扰、不循环）
function morseIsolatedTransform(text, settings, morseTable) {
  if (!morseTable) return text;
  var enc = (settings.enableMorse === "true");
  var dec = (settings.enableMorseDecode === "true");
  if (enc && dec) {
    // 双开：按输入内容分流，绝不对对方输出再处理
    return isMorseLike(text) ? morseDecodeTransform(text, settings, morseTable)
                             : morseTransform(text, settings, morseTable);
  }
  if (dec) {
    // 仅解码：只处理摩斯码，非摩斯码原样返回
    return isMorseLike(text) ? morseDecodeTransform(text, settings, morseTable) : text;
  }
  // 仅编码
  return morseTransform(text, settings, morseTable);
}

// ================= 数字转中文 =================

var CN_LOWER = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
var CN_UPPER = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
var UNIT_LOWER = ["", "十", "百", "千"];
var UNIT_UPPER = ["", "拾", "佰", "仟"];
var BIG_LOWER = ["", "万", "亿", "万亿"];
var BIG_UPPER = ["", "万", "亿", "万亿"];

// 0-9999 段转中文（不含大单位）
function sectionToCn(num, digits, units) {
  if (num === 0) return digits[0];
  // 10~19：读「十/十一…」，不读「一十/一十一」（大写同理：拾/拾伍）
  if (num >= 10 && num < 20) {
    return (num === 10) ? units[1] : units[1] + digits[num % 10];
  }
  var s = "";
  var zeroPending = false;
  var hasAny = false;
  var pos = 0;
  while (num > 0) {
    var d = num % 10;
    if (d === 0) {
      if (hasAny) zeroPending = true;
    } else {
      if (zeroPending) { s = digits[0] + s; zeroPending = false; }
      s = digits[d] + units[pos] + s;
      hasAny = true;
    }
    num = Math.floor(num / 10);
    pos++;
  }
  return s;
}

// 整数部分 0 到万亿
function intToCn(n, upper) {
  var digits = upper ? CN_UPPER : CN_LOWER;
  var units = upper ? UNIT_UPPER : UNIT_LOWER;
  var bigs = upper ? BIG_UPPER : BIG_LOWER;
  if (n === 0) return digits[0];
  if (n < 0) return "负" + intToCn(-n, upper);
  var s = "";
  var seg = 0;
  while (n > 0) {
    var part = n % 10000;
    if (part !== 0) {
      var partStr = sectionToCn(part, digits, units);
      // 段间补零：非最低段（s 非空）且本段<1000（该段存在前导零）→ 在大单位后补零
      // 例：10086 → 一万零八十六；100010086 → 一亿零一万零八十六
      if (s.length > 0 && part < 1000) {
        s = partStr + bigs[seg] + digits[0] + s;
      } else {
        s = partStr + bigs[seg] + s;
      }
    }
    n = Math.floor(n / 10000);
    seg++;
  }
  return s;
}

function num2cnTransform(text, settings) {
  var upper = (settings.cnCase === "upper");
  return text.replace(/\d+(\.\d+)?/g, function (m) {
    var dot = m.indexOf(".");
    if (dot < 0) return intToCn(parseInt(m, 10), upper);
    var intPart = parseInt(m.substring(0, dot), 10);
    var frac = m.substring(dot + 1);
    var digits = upper ? CN_UPPER : CN_LOWER;
    var s = intToCn(intPart, upper);
    if (frac.length > 0) {
      s += upper ? "点" : "点";
      for (var i = 0; i < frac.length; i++) {
        s += digits[parseInt(frac.charAt(i), 10)];
      }
    }
    return s;
  });
}

// ================= 公历转农历 + 干支 =================

function leapMonth(lunar, y) { return lunar.info[y - 1900] & 0xf; }
function leapDays(lunar, y) {
  if (leapMonth(lunar, y)) return (lunar.info[y - 1900] & 0x10000) ? 30 : 29;
  return 0;
}
function monthDays(lunar, y, m) {
  if (m > 12 || m < 1) return -1;
  return (lunar.info[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}
function lYearDays(lunar, y) {
  var i, sum = 348;
  for (i = 0x8000; i > 0x8; i >>= 1) sum += (lunar.info[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(lunar, y);
}
function toGanZhiYear(lunar, lYear) {
  var ganKey = (lYear - 3) % 10;
  var zhiKey = (lYear - 3) % 12;
  if (ganKey === 0) ganKey = 10;
  if (zhiKey === 0) zhiKey = 12;
  return lunar.gan[ganKey - 1] + lunar.zhi[zhiKey - 1];
}
function toChinaMonth(lunar, m) {
  if (m > 12 || m < 1) return "?";
  return lunar.nStr3[m - 1] + "月";
}
function toChinaDay(lunar, d) {
  var s;
  if (d === 10) s = "初十";
  else if (d === 20) s = "二十";
  else if (d === 30) s = "三十";
  else {
    s = lunar.nStr2[Math.floor(d / 10)];
    s += lunar.nStr1[d % 10];
  }
  return s;
}
function getAnimal(lunar, y) { return lunar.animals[(y - 4) % 12]; }

// 公历 y-m-d → 农历对象（移植自 calendar.js，纯标准 JS，无 Date.UTC）
function solar2lunar(lunar, y, m, d) {
  if (y < 1900 || y > 2100) return null;
  if (y === 1900 && m === 1 && d < 31) return null;
  // 计算与 1900-01-31 的偏移（天数）
  function daysFrom1900(yy, mm, dd) {
    var days = 0;
    for (var i = 1900; i < yy; i++) {
      days += ((i % 4 === 0 && i % 100 !== 0) || i % 400 === 0) ? 366 : 365;
    }
    var mon = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (var j = 0; j < mm - 1; j++) {
      days += mon[j];
      if (j === 1 && ((yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0)) days++;
    }
    return days + dd;
  }
  var offset = daysFrom1900(y, m, d) - daysFrom1900(1900, 1, 31);
  var i, temp = 0;
  for (i = 1900; i < 2101 && offset > 0; i++) {
    temp = lYearDays(lunar, i);
    offset -= temp;
  }
  if (offset < 0) { offset += temp; i--; }
  var year = i;
  var leap = leapMonth(lunar, year);
  var isLeap = false;
  var month = 0, day = 0;
  for (i = 1; i < 13 && offset > 0; i++) {
    if (leap > 0 && i === (leap + 1) && isLeap === false) {
      --i;
      isLeap = true;
      temp = leapDays(lunar, year);
    } else {
      temp = monthDays(lunar, year, i);
    }
    if (isLeap === true && i === (leap + 1)) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && i === leap + 1) {
    if (isLeap) isLeap = false;
    else { isLeap = true; --i; }
  }
  if (offset < 0) { offset += temp; --i; }
  month = i;
  day = offset + 1;
  return {
    year: year, month: month, day: day,
    isLeap: isLeap,
    gzYear: toGanZhiYear(lunar, year),
    animal: getAnimal(lunar, year),
    monthCn: (isLeap ? "闰" : "") + toChinaMonth(lunar, month),
    dayCn: toChinaDay(lunar, day)
  };
}

function calendarTransform(text, settings, data) {
  var lunar = data && data.lunar;
  if (!lunar) return text;
  var out = "";
  var changed = false;
  // 匹配 YYYY-MM-DD / YYYY/MM/DD / YYYY年M月D日
  var re = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/g;
  out = text.replace(re, function (m, yy, mm, dd) {
    var y = parseInt(yy, 10), mo = parseInt(mm, 10), d = parseInt(dd, 10);
    var r = solar2lunar(lunar, y, mo, d);
    if (r === null) return m;
    changed = true;
    return m + "（" + r.monthCn + r.dayCn + "，" + r.gzYear + "年，" + r.animal + "年）";
  });
  return changed ? out : text;
}

// ================= 年号转换（前1600 商 → 2100，含无年号时期与民国纪年） =================

// 数字转中文（1-9999，年号纪年用；传统纪年用汉字数字，如「三年」「三十四年」）
var ERA_CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
var ERA_CN_UNIT = ["", "十", "百", "千"];
function eraNumToCn(n) {
  if (n === 0) return "零";
  if (n < 0) return "负" + eraNumToCn(-n);
  // 10~19：读「十/十一…」，不读「一十/一十一」
  if (n >= 10 && n < 20) return "十" + (n % 10 ? ERA_CN_NUM[n % 10] : "");
  var s = "", zeroPending = false, hasAny = false, pos = 0;
  while (n > 0) {
    var d = n % 10;
    if (d === 0) {
      if (hasAny) zeroPending = true;
    } else {
      if (zeroPending) { s = ERA_CN_NUM[0] + s; zeroPending = false; }
      s = ERA_CN_NUM[d] + ERA_CN_UNIT[pos] + s;
      hasAny = true;
    }
    n = Math.floor(n / 10);
    pos++;
  }
  return s;
}

// 依据 era 表条目与公历年份生成标注文本
function eraLabel(e, y) {
  // 民国纪年（1912 起，民国纪年=公历-1911，延续至今）
  if (e.dyn === "" && e.name === "民国") {
    var n = y - 1911;
    return "民国" + (n === 1 ? "元年" : eraNumToCn(n) + "年");
  }
  if (e.name) {
    var nian = y - e.start + 1;
    return e.dyn + e.name + (nian === 1 ? "元年" : eraNumToCn(nian) + "年");
  }
  // 无年号时期（商/周/秦/西汉初/新莽/中华人民共和国）：直接标朝代
  return e.dyn;
}

function eraTransform(text, settings, data) {
  var era = data && data.era;
  if (!era) return text;
  var out = "";
  var changed = false;
  // 匹配四类年份（避免 lookbehind，用回调里 offset 判前字符）：
  //   1) 公元前：前1046 / 前1046年 / 公元前1046年
  //   2) 「公元N年」：公元25年 / 公元627年（1-4 位，明确公元语境）
  //   3) 公元后带「年」：1046年 / 627年（3-4 位，早期 1-2 位须带「公元」前缀避免误伤时长）
  //   4) 独立 4 位公历年：1046 / 2024（仅 1000-2100，避免误伤价格/电话号）
  var re = /(?:公元)?前\s*(\d{1,4})(?!\d)(?:年)?|公元\s*(\d{1,4})\s*年(?!\d)|(\d{3,4})\s*年(?!\d)|(\d{4})(?!\d)/g;
  out = text.replace(re, function (m, bc, adPre, adY, solo, offset, full) {
    var y, isBC = false;
    if (bc !== undefined) {
      y = -parseInt(bc, 10);
      isBC = true;
    } else if (adPre !== undefined) {
      // 「公元N年」明确公元后
      y = parseInt(adPre, 10);
    } else if (adY !== undefined) {
      // 前面不能紧跟数字（避免「11234年」取到 1234）
      if (offset > 0 && /[0-9]/.test(full.charAt(offset - 1))) return m;
      y = parseInt(adY, 10);
    } else {
      // 独立 4 位：前字符不能是数字，且限 1000-2100
      if (offset > 0 && /[0-9]/.test(full.charAt(offset - 1))) return m;
      y = parseInt(solo, 10);
      if (y < 1000 || y > 2100) return m;
    }
    // 1949 年后不转换（中华人民共和国时期，公元纪年原样保留；1949 起即不标）
    if (y >= 1949) return m;
    // 民国纪年（1912-1948，民国纪年=公历-1911）
    if (y >= 1912) {
      changed = true;
      var n = y - 1911;
      return m + "（民国" + (n === 1 ? "元年" : eraNumToCn(n) + "年") + "）";
    }
    for (var i = 0; i < era.length; i++) {
      var e = era[i];
      if (y >= e.start && y <= e.end) {
        changed = true;
        return m + "（" + eraLabel(e, y) + "）";
      }
    }
    return m;
  });
  return changed ? out : text;
}

// ================= 入口（流水线：各模式独立开关，按序叠加） =================

function transform(text, ctx) {
  if (typeof text !== "string" || text.length === 0) return text;
  ctx = ctx || {};
  var settings = ctx.settings || {};
  var pinyin = (typeof __PINYIN__ !== "undefined") ? __PINYIN__ : null;
  var data = (typeof __DATA__ !== "undefined") ? __DATA__ : null;

  // 独立开关：默认闭，enableAnnotate 默认开（与旧版行为一致）。
  // 开启的模式按固定顺序流水线作用，后一个处理前一个的输出。
  // 注意：摩斯编码/解码合并为隔离阶段（一次只走一个方向，按输入内容分流），
  //      避免编码后又解码（或反向）造成循环抵消。
  var stages = [];
  if (settings.enableEra === "true") stages.push(function (t) { return eraTransform(t, settings, data); });
  if (settings.enableCalendar === "true") stages.push(function (t) { return calendarTransform(t, settings, data); });
  if (settings.enableNum2cn === "true") stages.push(function (t) { return num2cnTransform(t, settings); });
  if (settings.enableMorse === "true" || settings.enableMorseDecode === "true") {
    stages.push(function (t) { return morseIsolatedTransform(t, settings, data && data.morse); });
  }
  if (settings.enableS2t === "true") stages.push(function (t) { return convertScript(t, s2tMap(data)); });
  if (settings.enableT2s === "true") stages.push(function (t) { return convertScript(t, t2sMap(data)); });
  if (settings.enableAnnotate === "true") stages.push(function (t) { return annotateTransform(t, settings, pinyin); });

  var out = text;
  var changed = false;
  for (var i = 0; i < stages.length; i++) {
    var r = stages[i](out);
    if (r !== out) changed = true;
    out = r;
  }
  return changed ? out : text;
}