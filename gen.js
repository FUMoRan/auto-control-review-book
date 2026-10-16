/* =========================================================
   自控 · 现控 复习本 · gen.js
   按标签一键生成图表：纯本地、纯确定性，不联网、不使用任何 API。

   设计三层（全部与 DOM 无关，可在 Node 下单测）
   ----------
   1) 规则层  RULES        科目 → 标签 → 生成项（图 plots / 表 tables / 所需参数 need）
   2) 抽取层  extractParams(text)   从题面 LaTeX 里确定性抽取传递函数、微分方程、状态空间、
                                    开环增益等（不臆造：抽不到就给 null，由 UI 提示「缺少 …」）
   3) 表格层  buildTable(kind, params)  用系数算出表格数值（复用 plot.js 的求根/多项式工具）
   入口：plan(subject, item) → 生成清单（含就绪/缺失判定与可直接落地的绘图字段）

   依赖：plot.js（MQP）—— 浏览器里需先加载，Node 下内部按需 require；
        本文件顶层不接触 canvas / DOM。
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MQG = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isNode = (typeof module !== 'undefined' && !!module.exports);
  const g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof self !== 'undefined' ? self : {});
  const MQP = () => isNode ? require('./plot.js') : g.MQP;

  /* =========================================================
     一、规则层：标签 → 生成项
     R(plots, tables) → { plots, tables, need }
       plots  图型id  step 时域响应 / bode 幅频相频 / nyquist 奈奎斯特 /
                     nichols 尼科尔斯 / rootlocus 根轨迹 / polezero 零极点 /
                     state 状态响应 / phase 相平面
       tables 表型id  poles 极点稳定性 / perf 二阶性能 / routh 劳斯表 /
                     steady 型别稳态误差 / margins 稳定裕度 / freqs 频率响应关键点 /
                     coeffs 系数特征根 / ssmat 状态空间矩阵 / sschar 特征值稳定性 /
                     ctrbo 能控能观判定
       need   需要的参数（仅以下五个键，且只由 params 判定是否就绪）：
              tf 传递函数 / tfopen 开环传递函数 / eq 微分方程 /
              ss 状态空间矩阵 / k 增益
     ========================================================= */
  const PLOT_LABEL = {
    step: '时域响应', bode: '幅频/相频 Bode 图', nyquist: '奈奎斯特图',
    nichols: '尼科尔斯图', rootlocus: '根轨迹', polezero: '零极点图',
    state: '状态响应', phase: '相平面 / 相轨迹',
  };
  const TABLE_LABEL = {
    poles: '极点与稳定性', perf: '二阶系统性能指标', routh: '劳斯表',
    steady: '型别与稳态误差', margins: '稳定裕度', freqs: '频率响应关键点',
    coeffs: '系数与特征根', ssmat: '状态空间矩阵', sschar: '特征值与稳定性',
    ctrbo: '能控性与能观性判定',
  };
  const PLOT_NEED = {
    step: ['tf'], bode: ['tf'], nyquist: ['tfopen'], rootlocus: ['tfopen'],
    polezero: ['tf'], nichols: ['tfopen'], state: ['ss'], phase: ['tf'],
  };
  const TABLE_NEED = {
    poles: ['tf'], perf: ['tf'], routh: ['tf'], steady: ['tfopen'], margins: ['tfopen'],
    freqs: ['tf'], coeffs: ['tf'], ssmat: ['ss'], sschar: ['ss'], ctrbo: ['ss'],
  };
  const R = (plots, tables, need) => ({ plots: plots || [], tables: tables || [], need: need || [] });

  const RULES = {
    ac: {
      '一阶系统': R(['step'], ['coeffs']),
      '二阶系统': R(['step'], ['perf', 'poles']),
      '超调量': R(['step'], ['perf']),
      '调节时间': R(['step'], ['perf']),
      '稳态误差': R([], ['steady']),
      '响应对应': R(['step'], ['coeffs']),
      '劳斯判据': R([], ['routh']),
      '赫尔维茨判据': R([], ['routh']),
      '根轨迹': R(['rootlocus'], ['poles']),
      '渐近稳定': R(['polezero'], ['poles']),
      'BIBO 稳定': R(['polezero'], ['poles']),
      'Bode 图': R(['bode'], ['freqs', 'margins']),
      '奈奎斯特': R(['nyquist'], ['margins']),
      '尼科尔斯': R(['nichols'], ['margins']),
      '尼科尔斯图': R(['nichols'], ['margins']),
      '幅值裕度': R(['bode'], ['margins']),
      '相角裕度': R(['bode'], ['margins']),
      '截止频率': R(['bode'], ['margins']),
      '谐振峰值': R(['bode'], ['freqs']),
      '超前校正': R(['bode'], ['margins']),
      '滞后校正': R(['bode'], ['margins']),
      'PID': R(['bode'], ['margins']),
      '根轨迹校正': R(['rootlocus'], ['poles']),
      '相平面': R(['phase'], ['poles']),
      '相轨迹': R(['phase'], ['poles']),
      '型别': R([], ['steady']),
      '开环增益': R([], ['steady']),
    },
    lc: {
      '状态方程': R([], ['ssmat', 'sschar']),
      '输出方程': R([], ['ssmat', 'sschar']),
      '可控标准型': R([], ['ssmat', 'sschar']),
      '可观标准型': R([], ['ssmat', 'sschar']),
      '状态转移矩阵': R([], ['ssmat', 'sschar']),
      '矩阵指数': R([], ['ssmat', 'sschar']),
      '相似变换': R([], ['ssmat', 'sschar']),
      '多变量系统': R([], ['ssmat', 'sschar', 'ctrbo']),
      '数字控制器': R([], ['ssmat', 'sschar']),
      '能控性秩判据': R([], ['ctrbo']),
      'PBH 判据': R([], ['ctrbo']),
      '能观性秩判据': R([], ['ctrbo']),
      '能控分解': R([], ['ctrbo']),
      '能观分解': R([], ['ctrbo']),
      '李雅普诺夫': R([], ['sschar']),
      '极点配置': R([], ['sschar']),
      '状态反馈': R([], ['sschar']),
      '输出反馈': R([], ['sschar']),
      '观测器': R([], ['sschar']),
      '渐近稳定': R(['polezero'], ['sschar', 'poles']),
      '状态响应': R(['state'], ['ssmat', 'sschar']),
      '状态变量图': R(['state'], ['ssmat', 'sschar']),
      '相平面': R(['phase'], ['sschar']),
      '相轨迹': R(['phase'], ['sschar']),
      '离散化': R([], ['ssmat']),
      '零阶保持': R([], ['ssmat']),
      '采样周期': R([], ['ssmat']),
    },
  };

  const tagKey = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  function tagRule(subject, tag) {
    const m = RULES[subject];
    if (!m) return null;
    const k = tagKey(tag);
    if (m[k]) return m[k];
    const flat = k.replace(/\s+/g, '');
    const hit = Object.keys(m).find(x => x.replace(/\s+/g, '') === flat);
    return hit ? m[hit] : null;
  }
  function drivableTags(subject) {
    const m = RULES[subject] || {};
    return Object.keys(m).filter(k => m[k].plots.length || m[k].tables.length);
  }

  /* =========================================================
     二、LaTeX 子集 → 纯文本表达式（供多项式/有理式解析）
     ========================================================= */
  function normalizeTex(s) {
    return String(s == null ? '' : s)
      .replace(/\\left|\\right|\\!|\\,|\\;|\\:/g, '')
      .replace(/\\(?:mathrm|operatorname|text|mathbf|boldsymbol)\{([^{}]*)\}/g, '$1')
      .replace(/\\cdot|\\times/g, '*')
      .replace(/\\pi/g, ' pi ')
      .replace(/\\omega/g, ' w ')
      .replace(/\\Omega/g, ' W ')
      .replace(/\\zeta/g, 'zeta')
      .replace(/\\xi/g, 'xi')
      .replace(/\\(sin|cos|tan|arctan|arcsin|arccos|sinh|cosh|tanh|exp|ln|log|log10|sqrt|abs|sign)/g, '$1')
      .trim();
  }

  // 最内层 \frac{a}{b} → ((a)/(b))，循环直到没有
  function fracToExpr(s) {
    let out = String(s);
    for (let guard = 0; guard < 40; guard++) {
      const m = /\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/.exec(out);
      if (!m) break;
      out = out.slice(0, m.index) + '((' + m[1] + ')/(' + m[2] + '))' + out.slice(m.index + m[0].length);
    }
    return out;
  }

  // 顶层分子/分母分离：优先 \frac{..}{..}，否则看顶层 /
  function splitNumDen(s) {
    const str = String(s);
    const fi = str.search(/\\(?:d|t)?frac/);
    if (fi >= 0) {
      const p0 = str.indexOf('{', fi);
      const read = start => {
        let d = 0, j = start;
        for (; j < str.length; j++) {
          if (str[j] === '{') d++;
          else if (str[j] === '}') { d--; if (!d) break; }
        }
        if (d !== 0) throw new Error('花括号不匹配');
        return { text: str.slice(start + 1, j), end: j };
      };
      const a = read(p0);
      const p1 = str.indexOf('{', a.end + 1);
      if (p1 < 0) throw new Error('分式缺少分母');
      const b = read(p1);
      return { num: str.slice(0, fi) + a.text, den: b.text };
    }
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '/' && depth === 0) return { num: str.slice(0, i), den: str.slice(i + 1) };
    }
    return { num: str, den: '1' };
  }

  const FUNC_NAMES = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'log10', 'sqrt', 'abs', 'sign',
    'floor', 'ceil', 'round',
  ]);
  const lastIdent = out => {
    const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(out);
    return m ? m[1] : '';
  };
  // 隐式乘法：按相邻原子补 *；函数名与 ( 之间不补
  function insertMul(src) {
    const s = String(src);
    let out = '';
    let i = 0;
    let prev = 'none';   // none | num | id | close | open | op
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ('+-*/^,'.indexOf(c) >= 0) { out += c; prev = 'op'; i++; continue; }
      if (c === '(') {
        if (prev === 'num' || prev === 'close') out += '*';
        else if (prev === 'id' && !FUNC_NAMES.has(lastIdent(out))) out += '*';
        out += '('; prev = 'open'; i++; continue;
      }
      if (c === ')') { out += ')'; prev = 'close'; i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) { out += c; prev = 'none'; i++; continue; }
        if (prev === 'id' || prev === 'close' || prev === 'num') out += '*';
        out += m[0]; prev = 'num'; i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
        if (prev === 'num' || prev === 'close' || prev === 'id') out += '*';
        out += m[0]; prev = 'id'; i += m[0].length; continue;
      }
      if (c === '_' || c === '{' || c === '}') { i++; continue; }
      out += c; prev = 'none'; i++;
    }
    return out;
  }

  /* =========================================================
     三、多项式（s）解析：LaTeX 子集 → 降幂系数数组
     内部用 Map<指数,系数>，允许负幂（如 z^{-1}）
     ========================================================= */
  const pmul = (a, b) => {
    const o = new Map();
    a.forEach((ca, ea) => b.forEach((cb, eb) => {
      const k = ea + eb;
      o.set(k, (o.get(k) || 0) + ca * cb);
    }));
    return o;
  };
  const padd = (a, b) => {
    const o = new Map(a);
    b.forEach((cb, eb) => o.set(eb, (o.get(eb) || 0) + cb));
    return o;
  };
  const ppow = (base, n) => {
    let r = new Map([[0, 1]]);
    for (let i = 0; i < n; i++) r = pmul(r, base);
    return r;
  };

  function splitTop(s) {
    const out = [];
    let cur = '', depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (depth === 0 && (ch === '+' || ch === '-')) {
        const prev = cur.trim();
        if (ch === '-' && (prev === '' || /[+\-*/^(]$/.test(prev))) { cur += ch; continue; }
        if (prev !== '') out.push(cur);
        cur = ch === '-' ? '-' : '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim() !== '') out.push(cur);
    return out;
  }

  function termPoly(term, v) {
    let s = term.trim().replace(/\s+/g, '');
    if (!s) throw new Error('空项');
    let sign = 1;
    if (s[0] === '-') { sign = -1; s = s.slice(1); }
    else if (s[0] === '+') s = s.slice(1);
    let acc = new Map([[0, 1]]);
    let i = 0;
    const isVar = j => s.slice(j, j + v.length) === v
      && !/[A-Za-z0-9_]/.test(s[j + v.length] || '')
      && (j === 0 || !/[A-Za-z0-9_]/.test(s[j - 1] || ''));
    while (i < s.length) {
      const c = s[i];
      if (c === '*') { i++; continue; }
      if (c === '(') {
        let d = 1, j = i + 1;
        for (; j < s.length; j++) {
          if (s[j] === '(') d++;
          else if (s[j] === ')') { d--; if (!d) break; }
        }
        if (d !== 0) throw new Error('括号不匹配');
        const inner = polyInStr(s.slice(i + 1, j), v);
        let pow = 1;
        j++;
        if (s[j] === '^') {
          const m = /^\^(-?\d+)/.exec(s.slice(j));
          if (!m) throw new Error('括号幂次无法解析');
          pow = Number(m[1]); j += m[0].length;
        }
        if (pow < 0) throw new Error('括号的负幂次无法解析');
        acc = pmul(acc, ppow(inner, pow));
        i = j; continue;
      }
      if ((c >= '0' && c <= '9') || c === '.') {
        const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('数字格式错误');
        acc = pmul(acc, new Map([[0, Number(m[0])]]));
        i += m[0].length; continue;
      }
      if (isVar(i)) {
        i += v.length;
        let n = 1;
        if (s[i] === '^') {
          const m = /^\^(-?\d+)/.exec(s.slice(i));
          if (!m) throw new Error('幂次无法解析');
          n = Number(m[1]); i += m[0].length;
        }
        acc = pmul(acc, new Map([[n, 1]]));
        continue;
      }
      throw new Error('无法解析的片段：' + c);
    }
    return sign < 0 ? new Map([...acc].map(([e, c]) => [e, -c])) : acc;
  }

  function polyInStr(src, v) {
    let s = String(src).replace(/\s+/g, '').replace(/[{}\\]/g, '');
    if (!s) throw new Error('空多项式');
    s = insertMul(s);   // 支持隐式乘法：2s → 2*s，0.9z^{-1} → 0.9*z^-1
    const terms = splitTop(s);
    if (!terms.length) throw new Error('空多项式');
    let sum = new Map();
    for (const t of terms) sum = padd(sum, termPoly(t, v));
    return sum;
  }

  function trimZeros(a) {
    let i = 0;
    while (i < a.length - 1 && Math.abs(a[i]) < 1e-12) i++;
    return a.slice(i);
  }

  /* 有理式 → {num, den}：分子分母同乘 v^shift，保证都是正幂多项式 */
  function rationalCoeffs(src, v) {
    const f = splitNumDen(normalizeTex(src));
    const numM = polyInStr(f.num, v);
    const denM = polyInStr(f.den, v);
    let minE = 0;
    numM.forEach((c, e) => { if (Math.abs(c) > 1e-12 && e < minE) minE = e; });
    denM.forEach((c, e) => { if (Math.abs(c) > 1e-12 && e < minE) minE = e; });
    const shift = -minE;
    const toDesc = m => {
      let maxE = -Infinity;
      m.forEach((c, e) => { if (Math.abs(c) > 1e-12 && e + shift > maxE) maxE = e + shift; });
      if (maxE === -Infinity) return [0];
      const out = new Array(maxE + 1).fill(0);
      m.forEach((c, e) => { out[e + shift] += c; });
      return trimZeros(out.slice().reverse());
    };
    return { num: toDesc(numM), den: toDesc(denM) };
  }

  /* =========================================================
     四、抽取层：题面 → 参数（只由 params 判定，抽不到即 null）
     ========================================================= */
  // LaTeX 间距命令 \, \; \! \: \(空格) 内含标点，会干扰按标点的切分，先统一换成空格
  function stripSpacing(s) { return String(s == null ? '' : s).replace(/\\([ ,;:!])/g, ' '); }
  function plain(t) { return String(t).replace(/[${}\\]/g, ' '); }

  /* ---- 传递函数 ---- */
  function extractTFList(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    const out = [];
    const push = (name, v, rhs, idx) => {
      try {
        let r = rhs;
        if (v === 's') r = r.replace(/j\s*\\?omega/g, 's').replace(/\\?jw/g, 's');
        if (v === 'z') r = r.replace(/e\s*\^\s*\{?\s*j\s*\\?omega\s*\}?/g, 'z');
        const rc = rationalCoeffs(r, v);
        if (rc.den.length >= 1 && rc.num.length >= 1 && rc.den.length + rc.num.length > 2) {
          out.push({ name: name, domain: v === 'z' ? 'z' : 's', num: rc.num, den: rc.den, raw: rhs.trim(), _idx: idx });
        }
      } catch (e) { /* 换下一个候选 */ }
    };
    let m;
    const reSZ = /([A-Za-z][A-Za-z0-9_]*)\s*\(\s*(s|z)\s*\)\s*=\s*([^$，,;；\n]+)/g;
    while ((m = reSZ.exec(t))) push(m[1], m[2], m[3], m.index);
    const reW = /([A-Za-z][A-Za-z0-9_]*)\s*\(\s*j\s*\\?omega\s*\)\s*=\s*([^$，,;；\n]+)/g;
    while ((m = reW.exec(t))) push(m[1], 's', m[2], m.index);
    return out;
  }
  function extractTF(text) {
    const list = extractTFList(text);
    if (!list.length) return null;
    const c = list[0];
    return { name: c.name, domain: c.domain, num: c.num, den: c.den, raw: c.raw };
  }
  function extractOpenLoop(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    const list = extractTFList(t);
    for (const c of list) {
      const before = t.slice(Math.max(0, c._idx - 18), c._idx);
      if (/开环/.test(before)) return { name: c.name, domain: c.domain, num: c.num, den: c.den, raw: c.raw };
    }
    return null;
  }

  /* ---- 微分方程：y^{(n)} + a1 y^{(n-1)} + … = …  （a,b 降幂系数） ---- */
  function normalizeODER(t) {
    return t
      // \frac{d^{n}y}{dt^{n}}（含 \frac{dy}{dt} 的一阶写法）
      .replace(/\\frac\s*\{\s*d\s*(?:\^\s*\{\s*(\d+)\s*\})?\s*y\s*\}\s*\{\s*d\s*t\s*(?:\^\s*\{\s*(\d+)\s*\})?\s*\}/g,
        (mm, a, b) => 'y^{(' + ((a || b || '').trim() ? Number(a || b) : 1) + ')}')
      // \ddot{y} / \ddot y / \dot{y} / \dot y
      .replace(/\\ddot\s*\{?\s*y\s*\}?/g, 'y^{(2)}')
      .replace(/\\dot\s*\{?\s*y\s*\}?/g, 'y^{(1)}')
      // 撇号写法：先两撇，再一撇
      .replace(/y\s*''/g, 'y^{(2)}')
      .replace(/y\s*'/g, 'y^{(1)}')
      // 去掉 (t)
      .replace(/\(\s*t\s*\)/g, '');
  }
  function odeSegment(n) {
    const idxs = [];
    let i = -1;
    while ((i = n.indexOf('=', i + 1)) >= 0) idxs.push(i);
    for (const p of idxs) {
      let start = p;
      while (start > 0 && !/[$；\n。;]/.test(n[start - 1])) start--;
      const lhs = n.slice(start, p);
      if (!/y(?:\s*\^\s*\{?\s*\(?\s*\d)/.test(lhs) && !/(?:^|[^A-Za-z])y(?![A-Za-z])/.test(lhs)) continue;
      let end = p + 1;
      while (end < n.length && !/[$；\n。;]/.test(n[end])) end++;
      const rhs = n.slice(p + 1, end);
      if (!rhs.trim()) continue;
      return { lhs: lhs.trim(), rhs: rhs.trim() };
    }
    return null;
  }
  function parseOdeTerm(term, sym) {
    let s = term.trim().replace(/\s+/g, '').replace(/\*/g, '');
    if (!s) return null;
    let sign = 1;
    if (s[0] === '-') { sign = -1; s = s.slice(1); }
    else if (s[0] === '+') s = s.slice(1);
    const si = s.indexOf(sym);
    if (si < 0) return null;
    const coefStr = s.slice(0, si);
    let coef = 1;
    if (coefStr !== '' && coefStr !== '.') {
      const v = Number(coefStr);
      if (!isFinite(v)) return null;
      coef = v;
    }
    const rest = s.slice(si + sym.length);
    let order = 0;
    if (rest !== '') {
      const m = /^\^\s*\{\s*\(?\s*(\d+)\s*\)?\s*\}$/.exec(rest) || /^\^\s*(\d+)$/.exec(rest);
      if (!m) return null;
      order = Number(m[1]);
    }
    return { order: order, coef: sign * coef };
  }
  function parseOdeTerms(side, sym) {
    const s = side.replace(/\s+/g, '');
    const terms = splitTop(s);
    const map = new Map();
    for (const term of terms) {
      const p = parseOdeTerm(term, sym);
      if (!p) return null;
      map.set(p.order, (map.get(p.order) || 0) + p.coef);
    }
    return map;
  }
  function extractDiffEq(text) {
    const raw = stripSpacing(String(text == null ? '' : text));
    if (!/(?:^|[^A-Za-z])y(?![A-Za-z])/.test(raw) && !/\\dot|\\ddot|y\s*'/.test(raw)) return null;
    const n = normalizeODER(raw);
    const seg = odeSegment(n);
    if (!seg) return null;
    const aMap = parseOdeTerms(seg.lhs, 'y');
    if (!aMap || !aMap.size) return null;
    // 输入符号：优先 u，其次 x、r
    let inSym = null;
    for (const c of ['u', 'x', 'r']) {
      if (new RegExp('(?:^|[^A-Za-z])' + c + '(?![A-Za-z])').test(seg.rhs)) { inSym = c; break; }
    }
    let bMap;
    if (inSym) {
      bMap = parseOdeTerms(seg.rhs, inSym);
      if (!bMap) return null;
    } else {
      const v = Number(seg.rhs.replace(/\s+/g, ''));
      if (!isFinite(v)) return null;
      bMap = new Map([[0, v]]);
    }
    let maxA = 0; aMap.forEach((v, k) => { if (k > maxA) maxA = k; });
    let maxB = 0; bMap.forEach((v, k) => { if (k > maxB) maxB = k; });
    const a = new Array(maxA + 1).fill(0);
    aMap.forEach((v, k) => { a[maxA - k] = v; });
    const b = new Array(maxB + 1).fill(0);
    bMap.forEach((v, k) => { b[maxB - k] = v; });
    return { order: maxA, a: a, b: b, label: seg.lhs + ' = ' + seg.rhs };
  }
  function eqAsTF(eq) {
    if (!eq) return null;
    return { name: 'G', domain: 's', num: trimZeros(eq.b.slice()), den: trimZeros(eq.a.slice()), raw: eq.label };
  }

  /* ---- 状态空间：A/B/C/D = \begin{pmatrix}…\end{pmatrix} ---- */
  function numCell(c) {
    let s = String(c).replace(/[{}$\s]/g, '').replace(/\\(?:left|right|,|;|!|:)/g, '');
    if (s === '') return null;
    const mf = /\\?frac\{([^{}]*)\}\{([^{}]*)\}/.exec(s);
    if (mf) {
      const a = Number(mf[1]), b = Number(mf[2]);
      if (isFinite(a) && isFinite(b) && b !== 0) return a / b;
    }
    s = s.replace(/\\[a-zA-Z]+/g, '');
    const v = Number(s);
    return isFinite(v) ? v : null;
  }
  function matrixFromTex(src) {
    const m = /\\begin\{(?:p|b)matrix\}([\s\S]*?)\\end\{(?:p|b)matrix\}/.exec(String(src == null ? '' : src));
    if (!m) return null;
    const body = m[1].replace(/\\\\/g, '\n');
    const rows = body.split('\n').map(r => r.split('&').map(numCell));
    if (!rows.length) return null;
    if (rows.some(r => r.some(v => v == null || !isFinite(v)))) return null;
    if (rows.some(r => r.length !== rows[0].length)) return null;
    return rows;
  }
  function grabAssign(t, letter) {
    const pats = [
      letter + '\\s*=\\s*',
      '\\\\mathbf\\{\\s*' + letter + '\\s*\\}\\s*=\\s*',
      '\\\\boldsymbol\\{\\s*' + letter + '\\s*\\}\\s*=\\s*',
    ];
    for (const p of pats) {
      const re = new RegExp('(?:^|[^A-Za-z0-9_])' + p + '(\\\\begin\\{(?:p|b)matrix\\}[\\s\\S]*?\\\\end\\{(?:p|b)matrix\\})');
      const m = re.exec(t);
      if (m) return m[1];
    }
    return null;
  }
  function grabScalar(t, letter) {
    const re = new RegExp('(?:^|[^A-Za-z0-9_])' + letter + '\\s*=\\s*([+-]?\\d*\\.?\\d+)');
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  }
  function extractStateSpace(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    const A = matrixFromTex(grabAssign(t, 'A'));
    if (!A || !A.length) return null;
    const B = matrixFromTex(grabAssign(t, 'B'));
    const C = matrixFromTex(grabAssign(t, 'C'));
    let D = null;
    const dMat = matrixFromTex(grabAssign(t, 'D'));
    if (dMat) D = dMat;
    else { const d = grabScalar(t, 'D'); if (d != null) D = [[d]]; }
    return { A: A, B: B, C: C, D: D, n: A.length };
  }

  /* ---- 开环增益 K=… ---- */
  function extractGain(text) {
    const p = stripSpacing(String(text == null ? '' : text));
    const re = /(?:^|[^A-Za-z0-9_])[Kk]\s*=\s*([+-]?\d*\.?\d+)/g;
    let m, val = null;
    while ((m = re.exec(p))) val = Number(m[1]);
    return val;
  }

  /* ---- 性能指标（显式给出的 ζ / ωn） ---- */
  function extractSpec(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    let zeta = null, wn = null, m;
    if ((m = /\\zeta\s*=\s*([+-]?\d*\.?\d+)/.exec(t))) zeta = Number(m[1]);
    else if ((m = /\\xi\s*=\s*([+-]?\d*\.?\d+)/.exec(t))) zeta = Number(m[1]);
    if ((m = /\\omega\s*_?\s*\{?\s*n\s*\}?\s*=\s*([+-]?\d*\.?\d+)/.exec(t))) wn = Number(m[1]);
    else if ((m = /(?:^|[^A-Za-z])wn\s*=\s*([+-]?\d*\.?\d+)/.exec(t))) wn = Number(m[1]);
    if (zeta == null && wn == null) return null;
    return { zeta: zeta, wn: wn };
  }

  function extractParams(text) {
    const t = String(text == null ? '' : text);
    const tf = extractTF(t);
    const openLoop = extractOpenLoop(t);
    const eq = extractDiffEq(t);
    const ss = extractStateSpace(t);
    const gainK = extractGain(t);
    const notes = [];
    if (tf) notes.push('识别到传递函数 ' + (tf.name || 'G') + '(' + tf.domain + ')');
    if (openLoop) notes.push('识别到开环传递函数');
    if (eq) notes.push('识别到微分方程，阶数 n=' + eq.order);
    if (ss) notes.push('识别到状态空间矩阵，n=' + ss.n);
    if (gainK != null) notes.push('识别到增益 K=' + gainK);
    return { tf: tf, openLoop: openLoop, eq: eq, ss: ss, gainK: gainK, notes: notes };
  }

  /* =========================================================
     五、矩阵工具（状态空间用，纯数值）
     ========================================================= */
  function identity(n) { return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0)); }
  function matMul(A, B) {
    const n = A.length, k = B.length, m = B[0].length;
    const out = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      out[i][j] = s;
    }
    return out;
  }
  function matAdd(A, B) { return A.map((r, i) => r.map((v, j) => v + B[i][j])); }
  function matScale(A, c) { return A.map(r => r.map(v => v * c)); }
  function trace(A) { let s = 0; for (let i = 0; i < A.length; i++) s += A[i][i]; return s; }
  function hstack(blocks) {
    const rows = blocks[0].length;
    const out = [];
    for (let i = 0; i < rows; i++) {
      let r = [];
      blocks.forEach(b => { r = r.concat(b[i]); });
      out.push(r);
    }
    return out;
  }
  function toRows(M) { return Array.isArray(M[0]) ? M.map(r => r.slice()) : [M.slice()]; }

  // 特征多项式（降幂，首项为 1）：Faddeev–LeVerrier
  function charPoly(A) {
    const n = A.length;
    if (!n) return [1];
    const I = identity(n);
    let M = Array.from({ length: n }, () => new Array(n).fill(0));
    let cprev = 1;
    const coeffs = [1];
    for (let k = 1; k <= n; k++) {
      M = matAdd(matMul(A, M), matScale(I, cprev));
      const ck = -trace(matMul(A, M)) / k;
      coeffs.push(ck);
      cprev = ck;
    }
    return coeffs;
  }

  // 容差高斯消元的秩（tol ≈ 1e-9）
  function matrixRank(M) {
    if (!M || !M.length) return 0;
    const a = M.map(r => r.slice());
    const rows = a.length, cols = a[0].length;
    let rank = 0;
    for (let col = 0; col < cols && rank < rows; col++) {
      let piv = -1;
      for (let r = rank; r < rows; r++) { if (Math.abs(a[r][col]) > 1e-9) { piv = r; break; } }
      if (piv < 0) continue;
      if (piv !== rank) { const t = a[piv]; a[piv] = a[rank]; a[rank] = t; }
      for (let r = rank + 1; r < rows; r++) {
        const f = a[r][col] / a[rank][col];
        if (f === 0) continue;
        for (let c = col; c < cols; c++) a[r][c] -= f * a[rank][c];
      }
      rank++;
    }
    return rank;
  }

  function ctrbMatrix(A, B, n) {
    const N = n || A.length;
    const blocks = [B];
    let cur = B;
    for (let i = 1; i < N; i++) { cur = matMul(A, cur); blocks.push(cur); }
    return hstack(blocks);
  }
  function obsvMatrix(A, C, n) {
    const N = n || A.length;
    let cur = toRows(C);
    const blocks = [cur];
    for (let i = 1; i < N; i++) { cur = matMul(cur, A); blocks.push(cur); }
    return blocks.reduce((acc, b) => acc.concat(b), []);
  }
  function ctrbRank(A, B, n) { return matrixRank(ctrbMatrix(A, B, n)); }
  function obsvRank(A, C, n) { return matrixRank(obsvMatrix(A, C, n)); }
  function eigenValues(A) { return MQP().polyRoots(charPoly(A)); }

  // 线性方程组（Gauss–Jordan，部分选主元）；奇异返回 null
  function solveLinear(M, b) {
    const n = M.length;
    const A = M.map((r, i) => r.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / A[col][col];
        if (f === 0) continue;
        for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
      }
    }
    const x = new Array(n);
    for (let i = 0; i < n; i++) x[i] = A[i][n] / A[i][i];
    return x;
  }

  // 由状态空间（SISO）数值求传递函数：den=charPoly(A)，分子用采样+Vandermonde 拟合
  function ssScalarD(D) {
    if (D == null) return 0;
    if (typeof D === 'number') return D;
    if (Array.isArray(D)) return (Array.isArray(D[0]) ? D[0][0] : D[0]) || 0;
    return 0;
  }
  function ssAsTF(params) {
    const ss = params.ss;
    if (!ss || !ss.A || !ss.A.length) return null;
    const n = ss.A.length;
    const den = charPoly(ss.A);
    const noZeros = { name: 'G', domain: 's', num: [1], den: den, raw: '由状态空间特征多项式给出（未含零点）' };
    if (!ss.B || !ss.C || ss.B.length !== n || ss.B.some(r => !Array.isArray(r) || r.length !== 1)) return noZeros;
    const C = Array.isArray(ss.C[0]) ? ss.C[0] : ss.C;
    if (!Array.isArray(C) || C.length !== n) return noZeros;
    const D = ssScalarD(ss.D);
    const pts = [];
    for (let k = 0; k < n; k++) pts.push(2 * k + 1);
    const Nvals = [];
    for (const s of pts) {
      const M = ss.A.map((row, i) => row.map((v, j) => (i === j ? s - v : -v)));
      const rhs = ss.B.map(r => r[0]);
      const x = solveLinear(M, rhs);
      if (!x) return noZeros;
      let gv = D;
      for (let i = 0; i < n; i++) gv += C[i] * x[i];
      const dval = MQP().evalPoly(den, s);
      Nvals.push((gv - D) * dval);
    }
    const V = pts.map(s => {
      const row = [];
      for (let j = 0; j < n; j++) row.push(Math.pow(s, n - 1 - j));
      return row;
    });
    const c = solveLinear(V, Nvals);
    if (!c) return noZeros;
    const num = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) num[i + 1] += c[i];
    if (D !== 0) for (let i = 0; i <= n; i++) num[i] += D * den[i];
    return { name: 'G', domain: 's', num: trimZeros(num), den: den, raw: '由状态空间 (A,B,C,D) 数值求得的传递函数' };
  }

  function mainTF(params) {
    if (params.tf) return params.tf;
    const e = eqAsTF(params.eq);
    if (e) return e;
    return ssAsTF(params);
  }
  function openLoopOf(params) {
    return params.openLoop || mainTF(params);
  }

  /* =========================================================
     六、数值显示与频域工具
     ========================================================= */
  const f4 = x => {
    if (x == null || !isFinite(x)) return '—';
    if (Math.abs(x) < 1e-12) return '0';
    return String(Number(x.toPrecision(4)));
  };
  const cplx = p => (Math.abs(p.im) < 1e-9 ? f4(p.re) : f4(p.re) + (p.im > 0 ? ' + j' : ' − j') + f4(Math.abs(p.im)));
  const fmtNum = x => {
    if (!isFinite(x)) return '0';
    const r = Math.round(x * 1e6) / 1e6;
    return String(r);
  };
  const arrStr = a => '[' + a.map(fmtNum).join(', ') + ']';

  function respAt(num, den, w) {
    const z = { re: 0, im: w };
    const nv = MQP().evalPoly(num, z), dv = MQP().evalPoly(den, z);
    const dd = dv.re * dv.re + dv.im * dv.im;
    if (!dd) return { mag: Infinity, ph: 0, re: NaN, im: NaN };
    const re = (nv.re * dv.re + nv.im * dv.im) / dd;
    const im = (nv.im * dv.re - nv.re * dv.im) / dd;
    return { mag: Math.hypot(re, im), ph: Math.atan2(im, re) * 180 / Math.PI, re: re, im: im };
  }

  /* =========================================================
     七、表格层：params → 表格数据
     返回 { title, head:[], rows:[[]], note:'', tex?:true } 或 null
     ========================================================= */
  function polesTable(params) {
    const tf = mainTF(params);
    if (!tf || !tf.den || tf.den.length < 2) return null;
    const roots = MQP().polyRoots(tf.den);
    const rows = [];
    let anyRight = false, anyAxis = false;
    roots.forEach((r, i) => {
      const right = r.re > 1e-9;
      const axis = Math.abs(r.re) < 1e-9;
      if (right) anyRight = true;
      if (axis) anyAxis = true;
      rows.push(['极点 ' + (i + 1), cplx(r), f4(r.re), right ? '不稳定' : (axis ? '临界（虚轴）' : '稳定')]);
    });
    if (!rows.length) rows.push(['—', '—', '—', '分母为常数，无极点']);
    const conclusion = anyRight ? '存在右半平面极点 → 不稳定'
      : (anyAxis ? '存在虚轴极点 → 临界（不稳定）' : '全部在左半平面 → 稳定');
    rows.push(['结论', conclusion, '', '']);
    return {
      title: '极点与稳定性',
      head: ['#', '位置', '实部', '判定'],
      rows: rows,
      note: 's 域：全部极点 Re<0 才稳定（' + (tf.raw || 'G(s)') + '）',
    };
  }

  function perfTable(params) {
    const tf = mainTF(params);
    if (!tf || !tf.den || tf.den.length !== 3) return null;
    const a0 = tf.den[0];
    if (!a0) return null;
    const wn2 = tf.den[2] / a0;
    const wn = wn2 > 0 ? Math.sqrt(wn2) : NaN;
    const zeta = (isFinite(wn) && wn > 0) ? (tf.den[1] / a0) / (2 * wn) : NaN;
    const rows = [
      ['ζ（阻尼比）', f4(zeta)],
      ['ωn（自然频率 rad/s）', isFinite(wn) ? f4(wn) : '—'],
    ];
    let note;
    if (isFinite(zeta) && zeta > 0 && zeta < 1) {
      const s = Math.sqrt(1 - zeta * zeta);
      const sigma = 100 * Math.exp(-Math.PI * zeta / s);
      const tp = Math.PI / (wn * s);
      const ts = 4 / (zeta * wn);
      rows.push(['σ%（超调量）', f4(sigma)], ['tp（峰值时间 s）', f4(tp)], ['ts(2%)（调节时间 s）', f4(ts)]);
      note = '标准二阶振荡环节：σ%=100·e^(−πζ/√(1−ζ²))，tp=π/(ωn√(1−ζ²))，ts(2%)=4/(ζωn)';
    } else {
      rows.push(['σ%（超调量）', '—'], ['tp（峰值时间）', '—'], ['ts(2%)（调节时间）', '—']);
      note = 'ζ 不在 (0,1) 区间（过阻尼/临界/无阻尼或非振荡），超调量与峰值时间不适用，按理论应加以区分处理';
    }
    return {
      title: '二阶系统性能指标',
      head: ['指标', '值'],
      rows: rows,
      note: note,
    };
  }

  function routhRows(den) {
    const a = den.slice();
    const n = a.length;
    const L = Math.ceil(n / 2);
    const r0 = [], r1 = [];
    for (let i = 0; i < n; i += 2) r0.push(a[i]);
    for (let i = 1; i < n; i += 2) r1.push(a[i]);
    while (r0.length < L) r0.push(0);
    while (r1.length < L) r1.push(0);
    const rows = [r0, r1];
    let special = false;
    for (let k = 2; k < n; k++) {
      const p = rows[k - 1], p2 = rows[k - 2];
      if (p.every(v => Math.abs(v) < 1e-12)) { special = true; break; }
      const row = new Array(L).fill(0);
      for (let j = 0; j < L - 1; j++) {
        row[j] = Math.abs(p[0]) < 1e-12 ? 0 : (p[0] * p2[j + 1] - p2[0] * p[j + 1]) / p[0];
      }
      rows.push(row);
      if (Math.abs(p[0]) < 1e-12) { special = true; break; }
    }
    const firstCol = rows.map(r => r[0]);
    if (firstCol.some(v => Math.abs(v) < 1e-12)) special = true;
    return { rows: rows, firstCol: firstCol, special: special, order: n - 1 };
  }
  function signChanges(col) {
    let last = 0, changes = 0;
    for (const v of col) {
      if (Math.abs(v) < 1e-12) continue;
      const sgn = v > 0 ? 1 : -1;
      if (last !== 0 && sgn !== last) changes++;
      last = sgn;
    }
    return changes;
  }
  function routhTable(params) {
    const tf = mainTF(params);
    if (!tf || !tf.den || tf.den.length < 2) return null;
    const den = tf.den;
    const r = routhRows(den);
    const rows = r.rows.map((row, k) => {
      const pow = r.order - k;
      return ['s^' + pow].concat(row.map(v => f4(v)));
    });
    let note;
    if (r.special) {
      note = '劳斯表首列出现 0（或全零行），需用 ε 法或特殊处理，本表不给出确定的变号次数（不臆造数值走向）';
      rows.push(['结论', '首列含 0，需特殊处理']);
    } else {
      const changes = signChanges(r.firstCol);
      note = '首列变号 ' + changes + ' 次 → 右半平面极点 ' + changes + ' 个'
        + (changes === 0 ? '（系统稳定）' : '（系统不稳定）');
      rows.push(['结论', '首列变号 ' + changes + ' 次 → 右半平面极点 ' + changes + ' 个']);
    }
    return {
      title: '劳斯表',
      head: ['幂次'].concat(Array.from({ length: r.rows[0].length }, (_, i) => '列 ' + (i + 1))),
      rows: rows,
      note: note + '；依据降幂特征方程系数 ' + arrStr(den),
    };
  }

  function steadyTable(params) {
    const tf = openLoopOf(params);
    if (!tf || !tf.den || tf.den.length < 1) return null;
    let v = 0;
    for (let i = tf.den.length - 1; i >= 0; i--) { if (Math.abs(tf.den[i]) < 1e-12) v++; else break; }
    const denPrefix = tf.den.slice(0, tf.den.length - v);
    const cV = denPrefix.length ? denPrefix[denPrefix.length - 1] : 0;
    const numLast = tf.num.length ? tf.num[tf.num.length - 1] : 0;
    let K = cV !== 0 ? numLast / cV : NaN;
    if (params.gainK != null && isFinite(K)) K = K * params.gainK;
    const Kp = v === 0 ? K : Infinity;
    const Kv = v === 0 ? 0 : (v === 1 ? K : Infinity);
    const Ka = v === 0 ? 0 : (v === 1 ? 0 : (v === 2 ? K : Infinity));
    const num = x => !isFinite(x) ? '∞' : (Math.abs(x) < 1e-12 ? '0' : f4(x));
    const stepErr = v >= 1 ? 0 : (isFinite(Kp) ? 1 / (1 + Kp) : Infinity);
    const rampErr = v === 0 ? Infinity : (v === 1 ? (K !== 0 ? 1 / K : Infinity) : 0);
    const accErr = v <= 1 ? Infinity : (v === 2 ? (K !== 0 ? 1 / K : Infinity) : 0);
    return {
      title: '型别与稳态误差',
      head: ['量', '值'],
      rows: [
        ['型别 v（开环 s=0 极点重数）', String(v)],
        ['开环增益 K', num(K)],
        ['Kp = lim G(s)', num(Kp)],
        ['Kv = lim sG(s)', num(Kv)],
        ['Ka = lim s²G(s)', num(Ka)],
        ['阶跃 e_ss = 1/(1+Kp)', num(stepErr)],
        ['斜坡 e_ss = 1/Kv', num(rampErr)],
        ['加速度 e_ss = 1/Ka', num(accErr)],
      ],
      note: '由开环传递函数 ' + arrStr(tf.num) + '/' + arrStr(tf.den) + ' 数值求 v 与 K'
        + (params.gainK != null ? '；题面另给增益 K=' + params.gainK + ' 已一并计入' : ''),
    };
  }

  function phaseUnwrap(pts) {
    const out = [];
    let off = 0, prev = null;
    for (const p of pts) {
      const raw = p.ph;
      if (prev != null) {
        let d = raw - prev;
        if (d > 180) off -= 360; else if (d < -180) off += 360;
      }
      out.push(raw + off);
      prev = raw;
    }
    return out;
  }
  function marginsTable(params) {
    const tf = openLoopOf(params);
    if (!tf || !tf.den || tf.den.length < 2) return null;
    const num = tf.num, den = tf.den;
    const w0 = 1e-3, w1 = 1e4, N = 3000;
    const ws = [], mags = [], phs = [];
    for (let i = 0; i <= N; i++) {
      const w = Math.exp(Math.log(w0) + (Math.log(w1) - Math.log(w0)) * i / N);
      const r = respAt(num, den, w);
      ws.push(w); mags.push(r.mag); phs.push(r.ph);
    }
    const uw = phaseUnwrap(phs.map(p => ({ ph: p })));
    // |G|=1 交界
    let wc = null;
    for (let i = 1; i <= N; i++) {
      const f0 = mags[i - 1] - 1, f1 = mags[i] - 1;
      if ((f0 <= 0 && f1 >= 0) || (f0 >= 0 && f1 <= 0)) {
        const t = Math.abs(f1 - f0) < 1e-15 ? 0.5 : Math.abs(f0) / (Math.abs(f0) + Math.abs(f1));
        wc = ws[i - 1] + (ws[i] - ws[i - 1]) * t;
        break;
      }
    }
    // ∠G=−180 交界
    let wg = null;
    for (let i = 1; i <= N; i++) {
      const g0 = uw[i - 1] + 180, g1 = uw[i] + 180;
      if ((g0 <= 0 && g1 >= 0) || (g0 >= 0 && g1 <= 0)) {
        const t = Math.abs(g1 - g0) < 1e-15 ? 0.5 : Math.abs(g0) / (Math.abs(g0) + Math.abs(g1));
        wg = ws[i - 1] + (ws[i] - ws[i - 1]) * t;
        break;
      }
    }
    const gamma = wc != null ? 180 + respAt(num, den, wc).ph : null;
    const GM = wg != null ? -20 * Math.log10(respAt(num, den, wg).mag) : null;
    const isStable = gamma != null && GM != null && gamma > 0 && GM > 0;
    return {
      title: '稳定裕度',
      head: ['量', '值'],
      rows: [
        ['幅值交界频率 ωc（|G|=1）', wc != null ? f4(wc) : '在搜索范围内未找到'],
        ['相角裕度 γ = 180°+∠G(jωc)', gamma != null ? f4(gamma) + ' °' : '在搜索范围内未找到'],
        ['相位交界频率 ωg（∠G=−180°）', wg != null ? f4(wg) : '在搜索范围内未找到'],
        ['幅值裕度 GM = −20log₁₀|G(jωg)|', GM != null ? f4(GM) + ' dB' : '在搜索范围内未找到'],
        ['是否稳定（γ>0 且 GM>0）', (gamma != null && GM != null) ? (isStable ? '稳定' : '不稳定') : '无法判定'],
      ],
      note: '对开环 ' + arrStr(num) + '/' + arrStr(den) + ' 在 ω∈[1e−3,1e4] 数值扫描 3000 点；未找到的交界点如实标注，不编造',
    };
  }

  function freqsTable(params) {
    const tf = mainTF(params);
    if (!tf || !tf.den || tf.den.length < 2) return null;
    const w0 = 0.01, w1 = 100, k = 6;
    const rows = [];
    for (let i = 0; i < k; i++) {
      const w = Math.exp(Math.log(w0) + (Math.log(w1) - Math.log(w0)) * i / (k - 1));
      const r = respAt(tf.num, tf.den, w);
      const dB = r.mag > 0 && isFinite(r.mag) ? 20 * Math.log10(r.mag) : -Infinity;
      rows.push([f4(w), isFinite(dB) ? f4(dB) : '−∞', f4(r.ph)]);
    }
    return {
      title: '频率响应关键点',
      head: ['ω (rad/s)', '|G| (dB)', '∠G (°)'],
      rows: rows,
      note: 'ω 从 0.01 到 100 对数取 6 点；' + arrStr(tf.num) + '/' + arrStr(tf.den),
    };
  }

  function coeffsTable(params) {
    let num = null, den = null, src = '';
    if (params.tf) { num = params.tf.num; den = params.tf.den; src = '传递函数'; }
    else if (params.eq) { num = trimZeros(params.eq.b.slice()); den = trimZeros(params.eq.a.slice()); src = '微分方程'; }
    else if (params.ss) { den = charPoly(params.ss.A); num = (ssAsTF(params) || {}).num || [1]; src = '状态空间'; }
    else return null;
    const rows = [
      ['分子系数（降幂）', arrStr(num)],
      ['分母系数（降幂）', arrStr(den)],
    ];
    const roots = MQP().polyRoots(den);
    roots.forEach((r, i) => {
      rows.push(['特征根 ' + (i + 1), cplx(r) + '（' + (r.re < -1e-9 ? '稳定' : (Math.abs(r.re) < 1e-9 ? '临界' : '不稳定')) + '）']);
    });
    if (!roots.length) rows.push(['特征根', '分母为常数，无有限特征根']);
    return {
      title: '系数与特征根',
      head: ['项', '系数 / 根'],
      rows: rows,
      note: '来源：' + src + '；特征根由分母多项式降幂系数求根得到',
    };
  }

  function texMat(M) {
    if (!M || !M.length) return '\\begin{pmatrix}\\end{pmatrix}';
    return '\\begin{pmatrix}' + M.map(r => r.map(v => fmtNum(v)).join(' & ')).join(' \\\\ ') + '\\end{pmatrix}';
  }
  function ssmatTable(params) {
    const ss = params.ss;
    if (!ss || !ss.A) return null;
    const rows = [
      ['A', texMat(ss.A)],
      ['B', ss.B ? texMat(ss.B) : '0'],
      ['C', ss.C ? texMat(ss.C) : '0'],
      ['D', ss.D ? texMat(ss.D) : '0'],
      ['n（状态维数）', String(ss.n || ss.A.length)],
    ];
    return {
      title: '状态空间矩阵',
      head: ['矩阵', 'LaTeX'],
      rows: rows,
      tex: true,
      note: '由题面给出的 A/B/C/D 直接呈现为 LaTeX 矩阵',
    };
  }

  function sscharTable(params) {
    const ss = params.ss;
    if (!ss || !ss.A) return null;
    const roots = eigenValues(ss.A);
    const rows = [];
    let allNeg = true, anyAxis = false;
    roots.forEach((r, i) => {
      if (r.re > 1e-9) allNeg = false;
      if (Math.abs(r.re) < 1e-9) { anyAxis = true; }
      rows.push(['λ' + (i + 1), cplx(r)]);
    });
    if (!rows.length) rows.push(['λ', '（无）']);
    const conclusion = allNeg && !anyAxis ? '全部实部<0 → 渐近稳定' : (allNeg ? '含虚轴特征值 → 临界稳定' : '存在实部>0 特征值 → 不稳定');
    rows.push(['结论', conclusion]);
    return {
      title: '特征值与稳定性',
      head: ['特征值', '值'],
      rows: rows,
      note: 'A 的特征多项式（Faddeev–LeVerrier）：' + arrStr(charPoly(ss.A)) + ' 的根',
    };
  }

  function ctrboTable(params) {
    const ss = params.ss;
    if (!ss || !ss.A || !ss.B || !ss.C) return null;
    const n = ss.n || ss.A.length;
    const Qc = ctrbMatrix(ss.A, ss.B, n);
    const Qo = obsvMatrix(ss.A, ss.C, n);
    const rc = matrixRank(Qc), ro = matrixRank(Qo);
    return {
      title: '能控性与能观性判定',
      head: ['矩阵 / 判定', '内容'],
      rows: [
        ['能控性矩阵 Qc = [B AB … A^(n−1)B]', '[' + Qc.map(r => '[' + r.map(fmtNum).join(', ') + ']').join(', ') + ']'],
        ['rank Qc / n', rc + ' / ' + n],
        ['能控性判定', rc === n ? '满秩 → 能控' : '秩 ' + rc + ' < ' + n + ' → 不能控'],
        ['能观性矩阵 Qo = [C; CA; …; CA^(n−1)]', '[' + Qo.map(r => '[' + r.map(fmtNum).join(', ') + ']').join(', ') + ']'],
        ['rank Qo / n', ro + ' / ' + n],
        ['能观性判定', ro === n ? '满秩 → 能观' : '秩 ' + ro + ' < ' + n + ' → 不能观'],
      ],
      note: '秩用容差 1e−9 的高斯消元求得；满秩即为能控/能观',
    };
  }

  const TABLE_BUILDERS = {
    poles: polesTable, perf: perfTable, routh: routhTable, steady: steadyTable,
    margins: marginsTable, freqs: freqsTable, coeffs: coeffsTable,
    ssmat: ssmatTable, sschar: sscharTable, ctrbo: ctrboTable,
  };
  function buildTable(kind, params) {
    const fn = TABLE_BUILDERS[kind];
    if (!fn) return null;
    try { return fn(params || {}); } catch (e) { return null; }
  }

  /* =========================================================
     八、入口：plan(subject, item)
     ========================================================= */
  function readyFor(need, params) {
    switch (need) {
      case 'tf': return !!mainTF(params);
      case 'tfopen': return !!params.openLoop || !!mainTF(params);
      case 'eq': return !!params.eq;
      case 'ss': return !!params.ss;
      case 'k': return params.gainK != null;
      default: return true;
    }
  }
  const NEED_TEXT = {
    tf: '传递函数 $G(s)=…$（如 $\\frac{10}{s^{2}+2s+10}$）',
    tfopen: '开环传递函数（如 $G(s)=\\frac{1}{s(s+1)(s+2)}$）',
    eq: '微分方程（如 $y\'\'+3y\'+2y=u$）',
    ss: '状态空间矩阵 $A,B,C,D$',
    k: '增益 $K$（如 $K=5$）',
  };

  // 矩阵 → 输入框文本：「0, 1; -2, -3」（行用 ; 分隔）
  function matToStr(M) {
    if (!Array.isArray(M)) return String(M);
    if (!Array.isArray(M[0])) return M.join(', ');
    return M.map(r => r.join(', ')).join('; ');
  }

  function plotFields(kind, params) {
    if (kind === 'state') {
      const ss = params.ss;
      if (!ss || !ss.A) return null;
      const n = ss.n || ss.A.length;
      const Bcol = ss.B ? matToStr(ss.B) : Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)).join('; ');
      const Crow = ss.C ? matToStr(ss.C) : Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)).join(', ');
      return { A: matToStr(ss.A), B: Bcol, C: Crow, D: ss.D ? matToStr(ss.D) : '0',
        u: 'step', x0: '1, 0', tMax: '8', samples: '800', label: '状态响应（n=' + n + '）' };
    }
    const tf = (kind === 'nyquist' || kind === 'rootlocus' || kind === 'nichols') ? openLoopOf(params) : mainTF(params);
    if (!tf) return null;
    const num = arrStr(tf.num), den = arrStr(tf.den);
    const label = (tf.name || 'G') + '(' + (tf.domain || 's') + ')';
    if (kind === 'step') return { resp: 'step', num: num, den: den, tMax: '8', samples: '800', label: '单位阶跃响应 ' + label };
    if (kind === 'bode') return { num: num, den: den, domain: tf.domain === 'z' ? 'z' : 's', wMin: '0.01', wMax: '100', samples: '400', label: label };
    if (kind === 'nyquist') return { num: num, den: den, wMin: '0.01', wMax: '100', samples: '600', label: label };
    if (kind === 'nichols') return { num: num, den: den, wMin: '0.01', wMax: '100', samples: '600', label: label };
    if (kind === 'rootlocus') return { num: num, den: den, kMax: '50', samples: '220', label: label };
    if (kind === 'polezero') return { num: num, den: den, domain: tf.domain === 'z' ? 'z' : 's', label: label };
    if (kind === 'phase') {
      if (params.ss && Array.isArray(params.ss.A) && params.ss.A.length === 2) {
        return { A: matToStr(params.ss.A), num: '', den: '', x0: '1, 0', tMax: '12', samples: '400', label: '相平面 / 相轨迹' };
      }
      return { A: '', num: num, den: den, x0: '1, 0', tMax: '12', samples: '400', label: '相平面 / 相轨迹' };
    }
    return null;
  }

  function plan(subject, item) {
    const tags = (item && Array.isArray(item.tags)) ? item.tags : [];
    const text = [item && item.title, item && item.content, item && item.stem, item && item.analysis, item && item.knowledge]
      .filter(Boolean).join('\n');
    const params = extractParams(text);
    const hits = [];
    const plots = new Map(), tables = new Map();
    tags.forEach(t => {
      const r = tagRule(subject, t);
      if (!r) return;
      hits.push({ tag: t, plots: r.plots.slice(), tables: r.tables.slice() });
      r.plots.forEach(k => { if (!plots.has(k)) plots.set(k, []); plots.get(k).push(t); });
      r.tables.forEach(k => { if (!tables.has(k)) tables.set(k, []); tables.get(k).push(t); });
    });
    const items = [];
    plots.forEach((from, kind) => {
      const missing = (PLOT_NEED[kind] || []).filter(n => !readyFor(n, params));
      const fields = missing.length ? null : plotFields(kind, params);
      items.push({
        type: 'plot', kind: kind, label: PLOT_LABEL[kind] || kind, from: from,
        ready: !!fields, fields: fields,
        missing: fields ? [] : missing,
        hint: fields ? '' : missing.map(n => NEED_TEXT[n]).filter(Boolean).join('；'),
      });
    });
    tables.forEach((from, kind) => {
      const missing = (TABLE_NEED[kind] || []).filter(n => !readyFor(n, params));
      const data = missing.length ? null : buildTable(kind, params);
      items.push({
        type: 'table', kind: kind, label: TABLE_LABEL[kind] || kind, from: from,
        ready: !!data, data: data,
        missing: data ? [] : missing,
        hint: data ? '' : (missing.length ? missing.map(n => NEED_TEXT[n]).filter(Boolean).join('；') : '表数据需补全参数后才能生成'),
      });
    });
    return { subject: subject, tags: tags, hits: hits, items: items, params: params };
  }

  return {
    // 规则层
    RULES, PLOT_LABEL, TABLE_LABEL, PLOT_NEED, TABLE_NEED,
    tagRule, drivableTags, plan,
    // 抽取层
    extractParams, extractTF, extractTFList, extractOpenLoop,
    extractDiffEq, extractStateSpace, extractSpec,
    // 表格层
    buildTable,
    // 解析工具
    normalizeTex, fracToExpr, splitNumDen, insertMul, polyInStr, rationalCoeffs,
    // 矩阵工具
    matrixFromTex, matrixRank, charPoly, eigenValues, ctrbRank, obsvRank,
  };
});
