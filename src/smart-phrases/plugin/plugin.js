// 高级短语面板（v7）：定式文 + 动态统计。
//
// 核心玩法「定式文」：把输入框内容当变量嵌入句式。
//   输入框：隔壁老王 → 点按「昨天，隔壁老王获得诺贝尔搞笑奖提名」直接上屏整句。
//   格子显示的就是拼好的成品句（所见即所得），无需二次编辑。
//
// renderPanel(query, ctx)：
//   query = 输入框全文（宿主注入）
//   ctx.settings.pricePerToken = 每 token 单价（元，宿主注入插件设置）
//
// 占位符约定：
//   {X}   = 输入框全文（渲染时已替换为真实内容；空输入即为空，不加兜底）
//   {X1} {X2} = 输入框按空白切分后的第 1/2 个词（多词输入时各取所需）
//   {time:…} {date} {now} = 宿主时间占位符（commit 时取点按时刻）

// —— Unicode code point 计数（代理对按 1 个字符算）——
function countChars(s) {
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { i++; }
    n++;
  }
  return n;
}

// —— AI token 估算（近似 cl100k_base 风格 BPE 启发式）——
function estimateTokens(s) {
  var tokens = 0;
  var m, re;
  re = /[A-Za-z]+/g;
  while ((m = re.exec(s)) !== null) tokens += Math.ceil(m[0].length / 4);
  re = /[0-9]+/g;
  while ((m = re.exec(s)) !== null) tokens += Math.ceil(m[0].length / 3);
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff || code >= 0x3400 && code <= 0x4dbf ||
        code >= 0xf900 && code <= 0xfaff) { tokens++; }
    else if (code >= 0x20000 && code <= 0x2a6df) { tokens++; i++; }
    else if (code >= 0xd800 && code <= 0xdbff) { tokens++; i++; }
    else if (code === 0x20 || code === 0x9 || code === 0xa || code === 0xd) { }
    else if (code >= 0x30 && code <= 0x39 || code >= 0x41 && code <= 0x5a || code >= 0x61 && code <= 0x7a) { }
    else { tokens++; }
  }
  return Math.max(tokens, 1);
}

// —— 金额格式化 ——
function formatMoney(n) {
  if (n <= 0) return "0 元";
  if (n >= 1) return n.toFixed(2) + " 元";
  if (n >= 0.01) return n.toFixed(3) + " 元";
  return n.toFixed(6) + " 元";
}

// —— 时间格式化 ——
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function fmtTime(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

function renderPanel(query, ctx) {
  ctx = ctx || {};
  var editor = query || "";
  var count = countChars(editor);
  var tokens = estimateTokens(editor);
  var price = parseFloat((ctx.settings && ctx.settings.pricePerToken) || "0.00003");
  if (isNaN(price) || price < 0) price = 0.00003;
  var cost = tokens * price;
  var now = new Date();

  // ===== 定式文变量准备 =====
  var X = editor.trim();                     // 输入框全文（空就空，不加兜底）
  // 分词：按空格/中英文逗号顿号分号/斜杠竖线切——中文没空格，靠标点分多变量
  // 例：「老王，二狗」「老王/二狗」「老王 二狗」→ {X1}=老王 {X2}=二狗
  var words = editor.trim().split(/[\s,，、;；\/|]+/).filter(Boolean);

  // 句式模板：{X}={全文} {X1..3}={第1..3词}，渲染时替换
  // 缩略：显示文本里超长的变量截断为「前3字…」，commit 保持完整句（点按上屏的仍是全句）
  function brief(s, max) {
    var n = max || 6;
    var c = countChars(s);
    if (c <= n) return s;
    var out = "", k = 0, i = 0;
    while (i < s.length && k < n - 1) {
      var code = s.charCodeAt(i);
      var len = (code >= 0xd800 && code <= 0xdbff) ? 2 : 1;
      out += s.substr(i, len);
      i += len; k++;
    }
    return out + "…";
  }
  function tpl(s, shortMode) {
    var r = s.replace(/\{X([123]?)\}/g, function (_, n) {
      var v;
      if (n) {
        // 词位：有对应词用词；不够时用带圈数字占位（①②③=还缺第几个词），直观明了
        if (words.length >= +n) return shortMode ? brief(words[+n - 1]) : words[+n - 1];
        // 空输入（一个词都没有）时用托底词，句子完整可上屏
        if (words.length === 0) return ["张伟", "李娜", "王强"][+n - 1] || "某人";
        return ["①", "②", "③"][+n - 1] || "?";
      }
      v = X;
      return shortMode ? brief(v) : v;
    });
    // 时间词也预渲染进显示文本（点按时刻一般相差无几，commit 保持宿主占位符取最新）
    var d = new Date();
    return r
      .replace(/\{date\}/g, fmtDate(d))
      .replace(/\{time:HH:mm:ss\}/g, fmtTime(d));
  }

  function cell(text, commit) {
    return { text: text, commit: commit || text };
  }
  // 定式文 tab：句式数组 → 预拼成品句格子
  // 显示文本用缩略变量（长输入只露前几字），commit 是完整句 + 宿主替换前缀
  // （点按后输入框全文被完整成品句替换，避免追加重复）
  var REPLACE = "\uE000REPLACE\uE000";
  function formTab(label, arr) {
    return {
      label: label,
      body: {
        type: "grid",
        cols: 1,
        cells: arr.map(function (s) {
          return { text: tpl(s, true), commit: REPLACE + tpl(s) };
        })
      }
    };
  }
  // 普通成品话术 tab（静态）
  function phraseTab(label, arr) {
    return {
      label: label,
      body: { type: "grid", cols: 1, cells: arr.map(function (s) { return { text: s }; }) }
    };
  }

  return {
    type: "tabs",
    tabs: [
      // ===== 定式文：{X}=输入框内容嵌入句式，点按上屏整句 =====
      formTab("整活", [
        "昨天，{X}获得诺贝尔搞笑奖提名。",
        "经研究决定，授予{X}「年度摸鱼大师」称号。",
        "刚刚，{X}通过不懈努力，成功地把事情搞砸了。",
        "据可靠消息，{X}已被列入《人类迷惑行为大赏》候选名单。",
        "恭喜{X}解锁成就：一觉睡到自然醒（下午三点）。",
        "突发：{X}在便利店买了一瓶水，全程无人围观。",
        "专家提醒：{X}的迷之自信正在逼近安全阈值。",
        "通告：{X}今日宜宅家，忌社交，忌发朋友圈。",
        "热烈祝贺{X}喜提本世纪最快低头认错纪录。",
        "最新民调显示：{X}的支持率与床的舒适度成正比。",
        "Breaking：{X}已连续三天说「明天一定早起」，无一兑现。",
        "据知情人士透露，{X}的存钱计划卒于今天中午的外卖。",
        "紧急插播：{X}刚刚完成了人生第一次主动挂电话，可喜可贺。",
        "天气预报：{X}周边今明两天持续低气压，出门请谨慎。",
        "历史时刻！{X}终于想起了那个密码，用时仅三个月。",
        "官方通报：{X}的减肥事业已进入第 N+1 次重启阶段。"
      ]),
      formTab("夸夸", [
        "{X}也太厉害了吧！",
        "说真的，{X}是我见过最靠谱的人。",
        "有{X}在，这事儿就稳了。",
        "{X}出手，一个顶俩。",
        "悄悄说一句：{X}其实一直在偷偷变强。",
        "{X1}，你就是这个领域的天花板！",
        "第一次见到{X}这么靠谱的人，情绪价值直接拉满。",
        "{X}的操作，教科书级别。",
        "别人是参加比赛，{X}是来给评委上课的。",
        "建议{X}开班授课，我第一个报名。",
        "{X}这个人，处久了才知道有多难得。",
        "全世界都应该知道{X}有多好。",
        "{X}随便一动，就是别人努力十年的水平。",
        "跟{X}合作过一次，之后就再也看不上别人了。",
        "如果靠谱有形状，那一定是{X}的样子。",
        "认识{X}，是我今年最大的运气。"
      ]),
      formTab("吐槽", [
        "{X}又来？这世界对我可真是不薄。",
        "关于{X}，我只有一句话：绝了。",
        "{X}的一天：起床、纠结、放弃、睡觉。",
        "{X}表示：我不是针对谁，我是说在座的各位……",
        "{X}的字典里没有「失败」，因为全被划掉了。",
        "如何形容{X}？就，挺突然的。",
        "{X}的记性：好的不记，坏的过目不忘。",
        "{X}的嘴，骗人的鬼；但{X}的饭，是真的香。",
        "{X}的拖延症已经晚期了，医生说再拖就到明天了。",
        "别人emo一会儿，{X}能emo出连续剧。",
        "{X}买东西的唯一标准：哪个打折买哪个。",
        "{X}的心情就像 Wi-Fi，时有时无还得看位置。",
        "{X}的作息：白天醒着，晚上也醒着。",
        "{X}嘴上说不要，下单的时候手比谁都快。",
        "问：怎么让{X}动起来？答：说外卖到了。",
        "{X}的宗旨：能坐着绝不站着，能躺着绝不坐着。"
      ]),
      formTab("消息体", [
        "【突发】{X}，{time:HH:mm:ss}",
        "【通报】经查，{X}情况属实。",
        "【寻人启事】{X}，看到请回消息。",
        "【声明】{X}与此事无关，特此澄清。",
        "【提醒】{X}：您有一份今日份好运待领取。",
        "【官宣】{X}，正式营业，欢迎光临。",
        "【盘点】{X}的年度关键词：猝不及防。",
        "【快讯】{X}今日心情晴转多云，局部有小情绪。",
        "【辟谣】网传{X}一夜暴富纯属虚构，本人仍需上班。",
        "【招聘】急寻能治得了{X}的人，薪资面议。",
        "【公告】{X}已进入「谁也别惹我」模式，请勿靠近。",
        "【新闻】{X}于今日成功克制住了买奶茶的冲动，值得表彰。",
        "【温馨提示】{X}的好脾气余额不足，请谨慎发言。",
        "【最新消息】{X}把闹钟按掉后准时迟到了。",
        "【表彰】{X}荣膺「年度最会找借口」称号，实至名归。",
        "【转发】{X}的日常：一边焦虑一边躺平，两不耽误。"
      ]),
      formTab("通知", [
        "尊敬的{X}：您的申请已收到，请耐心等待。",
        "亲爱的{X}，温馨提示：明天记得带伞。",
        "致{X}：本通知自发布之日起生效。",
        "各位好，我是{X}，初来乍到，请多关照。",
        "{X}你好，你有一条新的留言，请查收。",
        "尊敬的{X}，您的快递正在派送中，请保持手机畅通。",
        "亲爱的{X}：经系统检测，您今日的可爱值已超标。",
        "致{X}：您预订的「一个好消息」已到货，请签收。",
        "温馨提示：{X}的表情包库存已清空，请及时补充。",
        "{X}，您预约的「好运气」已上线，请注意查收。",
        "通知：{X}的专属座位已预留，请对号入座。",
        "致{X}：感谢您对本店的支持，期待再次光临。",
        "尊敬的{X}：您的投诉已收到，但我们的意见是不改。",
        "亲爱的{X}：您订购的「周末双倍快乐」套餐已生效。",
        "{X}请注意：您的「拖延豁免权」今日已用完。",
        "系统通知：{X}的可爱已到账，请查收并继续保持。"
      ]),
      // ===== 双变量句式：输入「老王，二狗」（逗号/顿号/空格/斜杠分隔）→ {X1}=老王 {X2}=二狗 =====
      formTab("双人", [
        "{X1}和{X2}，缘分呐！",
        "官方认证：{X1}和{X2}是绝配。",
        "{X1}负责貌美如花，{X2}负责赚钱养家。",
        "论默契，{X1}和{X2}说第二，没人敢说第一。",
        "经群众举报，{X1}和{X2}经常一起干坏事。",
        "{X1}的一句话，{X2}能记一辈子。",
        "{X1}负责出主意，{X2}负责背锅。",
        "全世界都知道{X1}和{X2}是过命的交情。",
        "{X1}看了{X2}一眼，什么都没说，但都懂了。",
        "{X1}和{X2}的友情，比火锅还烫。",
        "友情提示：{X1}和{X2}同时出现时，请勿靠近。",
        "历史总是惊人地相似：又是{X1}，又是{X2}。",
        "{X1}递给{X2}一杯奶茶，就此定了终身。",
        "建议{X1}和{X2}直接领证，别耽误了。",
        "{X1}负责搞事，{X2}负责收场。",
        "{X1}和{X2}，一个敢说，一个敢信。",
        "世纪同框！{X1}与{X2}的历史性会面。",
        "{X1}往东，{X2}绝不往西。"
      ]),
      // ===== 普通成品话术（静态，直接上屏）=====
      phraseTab("话术", [
        "好的，收到",
        "明白了，这就处理",
        "稍等，我看一下",
        "在的，请说",
        "不好意思，刚才说错话了",
        "抱歉，我刚才没表达清楚",
        "对不起，是我疏忽了，马上改",
        "太感谢了！",
        "辛苦啦，多谢！",
        "先这样，回聊",
        "我去忙了，晚点聊",
        "睡了睡了，晚安"
      ]),
      {
        label: "字数",
        body: {
          type: "grid",
          cols: 1,
          cells: [
            cell("已输入 " + count + " 字"),
            cell("已输入 " + count + " 字 · 约 " + tokens + " tokens"),
            cell("已输入 " + count + " 个字符", "{editor}")
          ]
        }
      },
      {
        label: "Token",
        body: {
          type: "grid",
          cols: 1,
          cells: [
            cell("已输出 " + tokens + " tokens"),
            cell("已输出 " + tokens + " tokens · 计费 " + formatMoney(cost)),
            cell("按 " + price + " 元/token 计费")
          ]
        }
      },
      {
        label: "时间戳",
        body: {
          type: "grid",
          cols: 1,
          cells: [
            cell("本消息发送自 " + fmtTime(now), "本消息发送自 {time:HH:mm:ss}"),
            cell("本消息发送自 " + fmtDate(now) + " " + fmtTime(now), "本消息发送自 {date} {time:HH:mm:ss}"),
            cell("毫秒戳 " + now.getTime(), "毫秒戳 {now}")
          ]
        }
      }
    ]
  };
}