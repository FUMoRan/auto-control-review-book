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
                     ctrbo 能控能观判定 / encirc 奈奎斯特 P/N/Z / eqtype 相平面平衡点 /
                     locus 根轨迹特征量
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
    ctrbo: '能控性与能观性判定', encirc: '奈奎斯特判据（P/N/Z）', eqtype: '相平面平衡点类型',
    locus: '根轨迹特征量',
  };
  const PLOT_NEED = {
    step: ['tf'], bode: ['tf'], nyquist: ['tfopen'], rootlocus: ['tfopen'],
    polezero: ['tf'], nichols: ['tfopen'], state: ['ss'], phase: ['tf'],
  };
  const TABLE_NEED = {
    poles: ['tf'], perf: ['tf'], routh: ['tf'], steady: ['tfopen'], margins: ['tfopen'],
    freqs: ['tf'], coeffs: ['tf'], ssmat: ['ss'], sschar: ['ss'], ctrbo: ['ss'],
    encirc: ['tfopen'], eqtype: ['ss'], locus: ['tfopen'],
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
      '根轨迹': R(['rootlocus'], ['locus', 'poles']),
      '渐近稳定': R(['polezero'], ['poles']),
      'BIBO 稳定': R(['polezero'], ['poles']),
      'Bode 图': R(['bode'], ['freqs', 'margins']),
      '奈奎斯特': R(['nyquist'], ['margins', 'encirc']),
      '尼科尔斯': R(['nichols'], ['margins']),
      '尼科尔斯图': R(['nichols'], ['margins']),
      '幅值裕度': R(['bode'], ['margins']),
      '相角裕度': R(['bode'], ['margins']),
      '截止频率': R(['bode'], ['margins']),
      '谐振峰值': R(['bode'], ['freqs']),
      '超前校正': R(['bode'], ['margins']),
      '滞后校正': R(['bode'], ['margins']),
      'PID': R(['bode'], ['margins']),
      '根轨迹校正': R(['rootlocus'], ['locus', 'poles']),
      '相平面': R(['phase'], ['poles', 'eqtype']),
      '相轨迹': R(['phase'], ['poles', 'eqtype']),
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
      '相平面': R(['phase'], ['sschar', 'eqtype']),
      '相轨迹': R(['phase'], ['sschar', 'eqtype']),
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
     三、多项式解析：LaTeX 子集 → 降幂系数数组（支持「符号系数」）
     符号系数 SC：Map<单项式键, 数值>
       键 '' 表示常数；'K' / 'K^2' / 'K*a' 表示含符号参数 K、a 的项
       —— 参数名不做写死限制：单字母（K、a、b、T…）或常见控制符号
          （zeta / tau / Ts / Kp…）自动识别，其余按普通参数处理；
          纯数值输入时符号系数退化为常数，行为与旧版完全一致。
     多项式 内部用 Map<幂次, 符号系数>，允许负幂（如 z^{-1}）
     ========================================================= */
  const PARAM_NAMES = new Set(['zeta', 'xi', 'tau', 'wn', 'Ts', 'Tp', 'Kp', 'Ki', 'Kd', 'Kv', 'Ka']);
  const isParamName = s => /^[A-Za-z]$/.test(s) || PARAM_NAMES.has(s);

  const monParse = key => {
    const m = new Map();
    if (!key) return m;
    key.split('*').forEach(part => {
      const mm = /^([A-Za-z_][A-Za-z0-9_]*)(?:\^(\d+))?$/.exec(part);
      if (!mm) return;
      m.set(mm[1], (m.get(mm[1]) || 0) + (mm[2] ? Number(mm[2]) : 1));
    });
    return m;
  };
  const monBuild = m => [...m.keys()].filter(n => m.get(n) > 0).sort()
    .map(n => (m.get(n) === 1 ? n : n + '^' + m.get(n))).join('*');
  const monMul = (k1, k2) => {
    const m = monParse(k1);
    monParse(k2).forEach((e, n) => m.set(n, (m.get(n) || 0) + e));
    return monBuild(m);
  };

  const scNum = n => (Math.abs(n) < 1e-15 ? new Map() : new Map([['', n]]));
  const scVar = (name, e) => new Map([[name + ((e || 1) === 1 ? '' : '^' + (e || 1)), 1]]);
  const scAdd = (a, b) => {
    const o = new Map(a);
    b.forEach((v, k) => {
      const s = (o.get(k) || 0) + v;
      if (Math.abs(s) < 1e-12) o.delete(k); else o.set(k, s);
    });
    return o;
  };
  const scScale = (a, k) => {
    const o = new Map();
    a.forEach((v, key) => { const s = v * k; if (Math.abs(s) > 1e-12) o.set(key, s); });
    return o;
  };
  const scNeg = a => scScale(a, -1);
  const scMul = (a, b) => {
    const o = new Map();
    a.forEach((va, ka) => b.forEach((vb, kb) => {
      const key = monMul(ka, kb);
      const s = (o.get(key) || 0) + va * vb;
      if (Math.abs(s) < 1e-12) o.delete(key); else o.set(key, s);
    }));
    return o;
  };
  const scValue = a => {              // 纯数值 → number；含符号参数 → null
    for (const k of a.keys()) if (k !== '') return null;
    return a.size ? a.get('') : 0;
  };
  const scIsZero = a => !a.size;
  const scParams = a => {
    const st = new Set();
    a.forEach((_, key) => key.split('*').forEach(p => { if (p) st.add(p.replace(/\^\d+$/, '')); }));
    return [...st].sort();
  };
  const scEval = (a, env) => {        // 代入 env（参数→数值）；缺值返回 null
    let sum = 0;
    for (const [key, v] of a) {
      if (key === '') { sum += v; continue; }
      let prod = 1;
      for (const part of key.split('*')) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\^(\d+))?$/.exec(part);
        if (!m) return null;
        const pv = env ? env[m[1]] : undefined;
        if (pv == null || !isFinite(pv)) return null;
        prod *= Math.pow(pv, m[2] ? Number(m[2]) : 1);
      }
      sum += v * prod;
    }
    return sum;
  };
  const scText = a => {               // 纯文本，如 'K^2 + 2K + 1'
    const keys = [...a.keys()].filter(k => Math.abs(a.get(k)) > 1e-12)
      .sort((x, y) => (x === '' ? 1 : y === '' ? -1 : (x < y ? -1 : x > y ? 1 : 0)));
    if (!keys.length) return '0';
    let out = '';
    keys.forEach(k => {
      const v = a.get(k), mag = Math.abs(v);
      const showNum = k === '' || Math.abs(mag - 1) > 1e-12;
      const body = (showNum ? fmtNum(mag) : '') + (k ? k.replace(/\*/g, '·') : '');
      out += (out === '' ? (v < 0 ? '−' : '') : (v < 0 ? ' − ' : ' + ')) + body;
    });
    return out;
  };

  // 多项式：Map<幂次, 符号系数>
  const polyConst = n => (Math.abs(n) < 1e-15 ? new Map() : new Map([[0, scNum(n)]]));
  const pAdd = (a, b) => {
    const o = new Map(a);
    b.forEach((c, e) => {
      const s = scAdd(o.get(e) || new Map(), c);
      if (!s.size) o.delete(e); else o.set(e, s);
    });
    return o;
  };
  const pMul = (a, b) => {
    const o = new Map();
    a.forEach((ca, ea) => b.forEach((cb, eb) => {
      const e = ea + eb;
      const s = scAdd(o.get(e) || new Map(), scMul(ca, cb));
      if (!s.size) o.delete(e); else o.set(e, s);
    }));
    return o;
  };
  const pMulNum = (a, k) => {
    if (Math.abs(k) < 1e-15) return new Map();
    const o = new Map();
    a.forEach((c, e) => { const s = scScale(c, k); if (s.size) o.set(e, s); });
    return o;
  };
  const pNeg = a => pMulNum(a, -1);
  const pPow = (base, n) => {
    let r = polyConst(1);
    for (let i = 0; i < n; i++) r = pMul(r, base);
    return r;
  };
  const pParams = a => {
    const st = new Set();
    a.forEach(c => scParams(c).forEach(p => st.add(p)));
    return [...st].sort();
  };
  const pIsNum = a => { for (const c of a.values()) if (scValue(c) == null) return false; return true; };
  // 指数范围（只统计非零系数项）
  const pExpRange = a => {
    let minE = 0, maxE = -Infinity;
    a.forEach((c, e) => { if (c.size) { if (e < minE) minE = e; if (e > maxE) maxE = e; } });
    return { minE: minE, maxE: maxE };
  };
  // → 降幂的符号系数数组（按给定 shift 移幂，去首零）
  const pDescSym = (a, shift) => {
    let maxE = -Infinity;
    a.forEach((c, e) => { if (c.size && e + shift > maxE) maxE = e + shift; });
    if (maxE === -Infinity) return [new Map()];
    const out = Array.from({ length: maxE + 1 }, () => new Map());
    a.forEach((c, e) => { out[e + shift] = scAdd(out[e + shift], c); });
    out.reverse();
    while (out.length > 1 && !out[0].size) out.shift();
    return out;
  };
  // → 降幂的数值数组（按给定 shift 移幂）；含符号参数 → null
  const pDescNum = (a, shift) => {
    let maxE = -Infinity;
    a.forEach((c, e) => { if (c.size && e + shift > maxE) maxE = e + shift; });
    if (maxE === -Infinity) return [0];
    const out = new Array(maxE + 1).fill(0);
    for (const [e, c] of a) {
      const v = scValue(c);
      if (v == null) return null;
      out[e + shift] += v;
    }
    return trimZeros(out.slice().reverse());
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
    let acc = polyConst(1);
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
        acc = pMul(acc, pPow(inner, pow));
        i = j; continue;
      }
      if ((c >= '0' && c <= '9') || c === '.') {
        const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('数字格式错误');
        acc = pMul(acc, polyConst(Number(m[0])));
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
        acc = pMul(acc, new Map([[n, scNum(1)]]));
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
        const name = m[0];
        if (FUNC_NAMES.has(name)) throw new Error('不支持函数：' + name);
        if (name === 'pi') { acc = pMul(acc, polyConst(Math.PI)); i += 2; continue; }
        if (!isParamName(name)) throw new Error('无法解析的片段：' + name);
        i += name.length;
        let n = 1;
        if (s[i] === '^') {
          const mm = /^\^(-?\d+)/.exec(s.slice(i));
          if (!mm) throw new Error('符号系数幂次无法解析');
          n = Number(mm[1]); i += mm[0].length;
        }
        if (n < 0) throw new Error('符号系数不支持负幂次');
        acc = pMul(acc, new Map([[0, scVar(name, n)]]));
        continue;
      }
      throw new Error('无法解析的片段：' + c);
    }
    return sign < 0 ? pNeg(acc) : acc;
  }

  function polyInStr(src, v) {
    let s = String(src).replace(/\s+/g, '').replace(/[{}\\]/g, '');
    if (!s) throw new Error('空多项式');
    s = insertMul(s);   // 支持隐式乘法：2s → 2*s，0.9z^{-1} → 0.9*z^-1
    const terms = splitTop(s);
    if (!terms.length) throw new Error('空多项式');
    let sum = new Map();
    for (const t of terms) sum = pAdd(sum, termPoly(t, v));
    return sum;
  }

  function trimZeros(a) {
    let i = 0;
    while (i < a.length - 1 && Math.abs(a[i]) < 1e-12) i++;
    return a.slice(i);
  }

  /* 有理式 → 分子/分母：同乘 v^shift 保证都是正幂多项式；支持符号系数。
     返回 { snum, sden 符号系数数组；num, den 纯数值数组（含符号参数时为 null）；params 参数名；symbolic } */
  function rationalSym(src, v) {
    const f = splitNumDen(normalizeTex(src));
    const numM = polyInStr(f.num, v);
    const denM = polyInStr(f.den, v);
    const minE = Math.min(pExpRange(numM).minE, pExpRange(denM).minE);
    const shift = -minE;
    const num = pDescNum(numM, shift), den = pDescNum(denM, shift);
    return {
      snum: pDescSym(numM, shift), sden: pDescSym(denM, shift),
      num: num, den: den, shift: shift,
      params: pParams(pAdd(numM, denM)), symbolic: !(num && den),
    };
  }

  /* 旧接口：只接受纯数值有理式，含符号参数即抛错（保持既有契约） */
  function rationalCoeffs(src, v) {
    const r = rationalSym(src, v);
    if (r.symbolic) throw new Error('系数含符号参数：' + r.params.join('、'));
    return { num: r.num, den: r.den };
  }

  /* =========================================================
     四、抽取层：题面 → 参数（只由 params 判定，抽不到即 null）
     ========================================================= */
  // LaTeX 间距命令 \, \; \! \: \(空格) 内含标点，会干扰按标点的切分，先统一换成空格
  function stripSpacing(s) { return String(s == null ? '' : s).replace(/\\([ ,;:!])/g, ' '); }
  function plain(t) { return String(t).replace(/[${}\\]/g, ' '); }

  /* ---- 传递函数（支持符号系数：num/den 为纯数值数组，含符号参数时两者为 null，
         同时给出 snum/sden 符号系数数组与 params 参数名） ---- */
  function extractTFList(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    const out = [];
    const push = (name, v, rhs, idx) => {
      try {
        let r = rhs;
        if (v === 's') r = r.replace(/j\s*\\?omega/g, 's').replace(/\\?jw/g, 's');
        if (v === 'z') r = r.replace(/e\s*\^\s*\{?\s*j\s*\\?omega\s*\}?/g, 'z');
        const rc = rationalSym(r, v);
        if (rc.sden.length >= 1 && rc.snum.length >= 1 && rc.sden.length + rc.snum.length > 2) {
          out.push({
            name: name, domain: v === 'z' ? 'z' : 's',
            num: rc.num, den: rc.den, snum: rc.snum, sden: rc.sden,
            params: rc.params, symbolic: rc.symbolic,
            raw: rhs.trim(), _idx: idx,
          });
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
  const mkTF = c => ({
    name: c.name, domain: c.domain,
    num: c.num, den: c.den, snum: c.snum, sden: c.sden,
    params: c.params || [], symbolic: !!c.symbolic, raw: c.raw,
  });
  function extractTF(text) {
    const list = extractTFList(text);
    if (!list.length) return null;
    return mkTF(list[0]);
  }
  function extractOpenLoop(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    const list = extractTFList(t);
    for (const c of list) {
      const before = t.slice(Math.max(0, c._idx - 18), c._idx);
      if (/开环/.test(before)) return mkTF(c);
    }
    return null;
  }
  function extractClosedLoop(text) {
    const t = stripSpacing(String(text == null ? '' : text));
    const list = extractTFList(t);
    for (const c of list) {
      const before = t.slice(Math.max(0, c._idx - 18), c._idx);
      if (/闭环/.test(before)) return mkTF(c);
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
    const closedLoop = extractClosedLoop(t);
    const eq = extractDiffEq(t);
    const ss = extractStateSpace(t);
    const gainK = extractGain(t);
    const notes = [];
    if (tf) notes.push('识别到传递函数 ' + (tf.name || 'G') + '(' + tf.domain + ')');
    if (openLoop) notes.push('识别到开环传递函数');
    if (closedLoop) notes.push('识别到闭环传递函数');
    if (eq) notes.push('识别到微分方程，阶数 n=' + eq.order);
    if (ss) notes.push('识别到状态空间矩阵，n=' + ss.n);
    if (gainK != null) notes.push('识别到增益 K=' + gainK);
    return { tf: tf, openLoop: openLoop, closedLoop: closedLoop, eq: eq, ss: ss, gainK: gainK, notes: notes };
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

  /* 由传递函数自动建立可控标准型状态空间（A,B,C,D）：
     只有 G(s) 时也能出 ssmat / sschar / ctrbo（纯数值；含符号参数返回 null） */
  function tfToSS(tf) {
    if (!tf || !tf.num || !tf.den || tf.symbolic || tf.den.length < 2) return null;
    if (tf.num.length > tf.den.length) return null;
    try {
      const s = MQP().ssFromTF(tf.num, tf.den);
      return { A: s.A, B: s.B.map(v => [v]), C: [s.C.slice()], D: [[s.D]], n: s.n };
    } catch (e) { return null; }
  }
  function mainSS(params) {
    if (params && params.ss) return params.ss;
    return tfToSS(mainTF(params || {}));
  }

  /* 闭环 ⇄ 开环互推（单位反馈，纯数值；含符号参数返回 null）：
       由开环 G：T(s) = G/(1+G) = num/(den+num)
       由闭环 T：G(s) = T/(1−T) = num/(den−num) */
  const pnAdd = (a, b) => MQP().polyAdd(a, b);
  const pnScale = (a, k) => a.map(v => v * k);
  // 降幂系数多项式求导：d/ds
  const pDeriv = a => {
    const n = a.length - 1;
    const out = [];
    for (let i = 0; i < n; i++) out.push(a[i] * (n - i));
    return out.length ? out : [0];
  };
  // 符号分子（降幂 SC 数组）中提出单一增益参数 → 纯数值多项式；否则 null
  function numNumericFromSym(snum, gain) {
    const out = [];
    for (const c of snum) {
      if (!c.size) { out.push(0); continue; }
      if (c.size === 1 && c.has(gain)) { out.push(c.get(gain)); continue; }
      return null;   // 含常数项 / 其它参数 / 参数非线性幂次 → 非纯增益
    }
    return trimZeros(out);
  }
  function closedFromOpen(tf) {
    if (!tf || !tf.num || !tf.den || tf.symbolic) return null;
    return {
      name: tf.name || 'G', domain: tf.domain || 's',
      num: tf.num.slice(), den: pnAdd(tf.den, tf.num),
      raw: '由开环 ' + (tf.raw || 'G') + ' 单位反馈闭环得到 T(s)=G/(1+G)',
    };
  }
  function openFromClosed(tf) {
    if (!tf || !tf.num || !tf.den || tf.symbolic) return null;
    return {
      name: 'G', domain: tf.domain || 's',
      num: tf.num.slice(), den: pnAdd(tf.den, pnScale(tf.num, -1)),
      raw: '由闭环 T(s) 反推开环 G(s)=T/(1−T)',
    };
  }
  function closedLoopOf(params) {
    if (params.closedLoop) return params.closedLoop;
    if (params.openLoop) return closedFromOpen(params.openLoop) || params.openLoop;
    return mainTF(params);
  }
  function openLoopOf(params) {
    if (params.openLoop) return params.openLoop;
    if (params.closedLoop) return openFromClosed(params.closedLoop) || params.closedLoop;
    return mainTF(params);
  }

  /* =========================================================
     五·二、符号系数：劳斯判据与稳定参数范围
     参数名不做写死限制：单字母（K、a、b、T…）或常见控制符号
     （zeta/tau/wn/Kp…）自动识别；单参数时给出稳定范围。
     ========================================================= */
  // 选出「含符号系数」的传递函数（优先开环）
  function symTF(params) {
    const o = openLoopOf(params || {});
    if (o && o.symbolic && o.sden && o.snum) return o;
    const m = mainTF(params || {});
    if (m && m.symbolic && m.sden && m.snum) return m;
    return null;
  }
  // 降幂 SC 数组相加（右对齐，保持幂次）
  function sArrAdd(a, b) {
    const n = Math.max(a.length, b.length);
    const out = Array.from({ length: n }, () => new Map());
    const put = arr => arr.forEach((c, i) => {
      const k = i + (n - arr.length);
      out[k] = scAdd(out[k], c);
    });
    put(a); put(b);
    return out;
  }
  // 特征多项式（SC 降幂数组）：符号只在分母 → 取分母；否则按单位反馈取 den+num
  function charSym(params) {
    const tf = symTF(params);
    if (!tf) return null;
    const denHasParam = pParams(tf.sden).length > 0;
    const char = denHasParam ? tf.sden.map(c => new Map(c)) : sArrAdd(tf.sden, tf.snum);
    return { tf: tf, char: char, params: pParams(char), closedLoopForm: !denHasParam };
  }
  // SC → 单参数升幂系数（number[]）；含其它参数返回 null
  function scToUni(sc, p) {
    if (!sc || !sc.size) return [0];
    const out = [];
    for (const [key, v] of sc) {
      if (key === '') { out[0] = (out[0] || 0) + v; continue; }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\^(\d+))?$/.exec(key);
      if (!m || m[1] !== p) return null;
      const e = m[2] ? Number(m[2]) : 1;
      out[e] = (out[e] || 0) + v;
    }
    for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = 0;
    return out.length ? out : [0];
  }
  // 单参数多项式（升幂）→ 实根
  const uniRoots = u => MQP().polyRoots(u.slice().reverse())
    .filter(r => Math.abs(r.im) < 1e-7).map(r => r.re);
  // 特征多项式（SC 降幂数组）→ 文本，如 '(1)*s^3 + (3)*s^2 + (2)*s + (K)'
  function scArrText(char) {
    const n = char.length - 1;
    const parts = [];
    char.forEach((c, j) => {
      if (!c.size) return;
      const pow = n - j;
      const sPart = pow === 0 ? '' : (pow === 1 ? 's' : 's^' + pow);
      parts.push('(' + scText(c) + ')' + (pow ? '*' + sPart : ''));
    });
    return parts.join(' + ') || '0';
  }
  function fmtRange(p, iv) {
    const a = iv.lo, b = iv.hi;
    if (!isFinite(a) && !isFinite(b)) return p + ' 取任意实数值';
    if (!isFinite(a)) return p + ' < ' + f4(b);
    if (!isFinite(b)) return p + ' > ' + f4(a);
    return f4(a) + ' < ' + p + ' < ' + f4(b);
  }
  // s=jω 穿越：各项系数对参数至多一次时用消元法精确求解（pairs[j]=[常数项, 一次项]）
  function crossingsFromPairs(pairs) {
    const n = pairs.length - 1;
    const A0 = new Array(n + 1).fill(0), A1 = new Array(n + 1).fill(0);
    const B0 = new Array(n + 1).fill(0), B1 = new Array(n + 1).fill(0);
    pairs.forEach((u, j) => {
      const k = n - j, u0 = u[0] || 0, v0 = u[1] || 0;
      const reF = k % 4 === 0 ? 1 : (k % 4 === 2 ? -1 : 0);
      const imF = k % 4 === 1 ? 1 : (k % 4 === 3 ? -1 : 0);
      A0[k] += u0 * reF; A1[k] += v0 * reF;
      B0[k] += u0 * imF; B1[k] += v0 * imF;
    });
    const desc = a => a.slice().reverse();
    const Res = MQP().polyAdd(
      MQP().polyMul(desc(A0), desc(B1)),
      MQP().polyMul(desc(B0), desc(A1)).map(v => -v));
    const wroots = MQP().polyRoots(Res)
      .filter(r => Math.abs(r.im) < 1e-7 && r.re > 1e-7).map(r => r.re);
    const evalA = (a, w0) => a.reduce((s, c, k) => s + c * Math.pow(w0, k), 0);
    const out = [];
    wroots.forEach(w0 => {
      const a0 = evalA(A0, w0), a1 = evalA(A1, w0), b0 = evalA(B0, w0), b1 = evalA(B1, w0);
      let pv = null;
      if (Math.abs(a1) > 1e-12) pv = -a0 / a1;
      else if (Math.abs(b1) > 1e-12) pv = -b0 / b1;
      if (pv != null && isFinite(pv)) out.push({ w: w0, p: pv });
    });
    return out;
  }
  // 稳定参数范围（单参数）：划分区间 → 逐区间判稳 → 合并
  function stableRange(params) {
    const cs = charSym(params);
    if (!cs) return null;
    if (cs.params.length !== 1) return { unsupported: true, cs: cs };
    const p = cs.params[0];
    const char = cs.char;
    const uni = char.map(c => scToUni(c, p));
    if (uni.some(u => u == null)) return { unsupported: true, cs: cs };
    // 1) 各系数零点
    const coeffZeros = [];
    uni.forEach(u => uniRoots(u).forEach(r => coeffZeros.push(r)));
    // 2) s=jω 穿越（各系数对参数至多一次时可用消元法精确求解）
    const critical = [];
    if (uni.every(u => u.length <= 2)) {
      crossingsFromPairs(uni.map(u => [u[0] || 0, u[1] || 0])).forEach(x => critical.push(x.p));
    }
    const uniq = arr => {
      const out = [];
      arr.filter(isFinite).sort((a, b) => a - b)
        .forEach(v => { if (!out.length || Math.abs(v - out[out.length - 1]) > 1e-6) out.push(v); });
      return out;
    };
    const edges = uniq(coeffZeros.concat(critical));
    const reps = [];
    if (!edges.length) reps.push({ lo: -Infinity, hi: Infinity, x: 0 });
    else {
      reps.push({ lo: -Infinity, hi: edges[0], x: edges[0] - Math.max(1, Math.abs(edges[0])) });
      for (let i = 0; i < edges.length - 1; i++) reps.push({ lo: edges[i], hi: edges[i + 1], x: (edges[i] + edges[i + 1]) / 2 });
      reps.push({ lo: edges[edges.length - 1], hi: Infinity, x: edges[edges.length - 1] + Math.max(1, Math.abs(edges[edges.length - 1])) });
    }
    const env = {};
    const stableAt = val => {
      env[p] = val;
      const den = char.map(c => scEval(c, env));
      if (den.some(v => v == null) || den.length < 2) return false;
      if (!isFinite(den[0]) || den[0] === 0) return false;
      const r = routhRows(den);
      return !r.special && signChanges(r.firstCol) === 0;
    };
    const intervals = reps.filter(rp => stableAt(rp.x)).map(rp => ({ lo: rp.lo, hi: rp.hi }));
    const rangeText = intervals.length
      ? intervals.map(iv => fmtRange(p, iv)).join(' 或 ')
      : '任何参数值下都不稳定';
    return {
      param: p, char: char, charText: scArrText(char),
      critical: uniq(critical), coeffZeros: uniq(coeffZeros),
      intervals: intervals, rangeText: rangeText, closedLoopForm: cs.closedLoopForm,
    };
  }
  function symbolicRouthTable(params) {
    const r = stableRange(params);
    if (!r) return null;
    if (r.unsupported) {
      const cs = r.cs;
      return {
        title: '劳斯判据 · 符号系数',
        head: ['量', '内容'],
        rows: [
          ['特征方程', scArrText(cs.char)],
          ['参数', cs.params.join('、') || '无'],
          ['稳定范围', '符号参数多于一个，需固定其余参数才能给出唯一范围'],
        ],
        note: '特征多项式含符号系数；多参数时稳定范围不唯一，如实说明而不臆断',
      };
    }
    return {
      title: '劳斯判据 · 符号系数与稳定参数范围',
      head: ['量', '内容'],
      rows: [
        ['参数', r.param],
        ['特征方程' + (r.closedLoopForm ? '（闭环 1+G=0）' : ''), r.charText],
        ['系数零点（参数）', r.coeffZeros.length ? r.coeffZeros.map(f4).join('、') : '无'],
        ['临界参数值（s=jω 穿越）', r.critical.length ? r.critical.map(f4).join('、') : '无'],
        ['稳定范围', r.rangeText],
      ],
      note: '系数随参数变化时，用 s=jω 穿越条件与系数零点划分参数区间，'
        + '再逐区间对特征多项式做劳斯首列变号判定（0 次变号 → 稳定）；参数名自动识别，不限 K。',
    };
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
    const tf = closedLoopOf(params);
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

  // 二阶：分母恰为三个系数时用标准解析公式
  function perfSecondOrder(tf) {
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

  // 任意阶：对单位阶跃响应做数值积分求时域指标（不再锁死三系数二阶）
  function perfNumeric(tf) {
    const den = tf.den;
    if (!den || den.length < 2) return null;
    let sys;
    try { sys = MQP().ssFromTF(tf.num, den); } catch (e) { return null; }
    const roots = MQP().polyRoots(den);
    const unstable = roots.some(r => r.re > 1e-9);
    const anyAxis = roots.some(r => Math.abs(r.re) <= 1e-9);
    let slow = Infinity;
    roots.forEach(r => { const a = Math.abs(r.re); if (a > 1e-9 && a < slow) slow = a; });
    const tMax = isFinite(slow) ? Math.min(400, Math.max(8, 8 / slow)) : 16;
    const N = 2000;
    const sim = MQP().integrateRK4(sys, new Array(sys.n).fill(0), tMax, N, 1);
    const xs = sim.xs;
    const ts = xs.map((_, i) => i * sim.dt);
    const ys = xs.map(x => { let y = sys.D; for (let j = 0; j < sys.n; j++) y += sys.C[j] * x[j]; return y; });
    let yss = ys[ys.length - 1];
    if (!unstable && !anyAxis) {
      const xss = solveLinear(sys.A.map(r => r.map(v => -v)), sys.B);
      if (xss) { yss = sys.D; for (let j = 0; j < sys.n; j++) yss += sys.C[j] * xss[j]; }
    }
    if (unstable || anyAxis) {
      return {
        title: '时域性能指标（数值）',
        head: ['指标', '值'],
        rows: [['稳定性', unstable ? '不稳定（发散）' : '临界（等幅振荡）'], ['σ%（超调量）', '—'],
          ['tp（峰值时间）', '—'], ['ts(2%)（调节时间）', '—'], ['稳态值 y∞', '—']],
        note: (unstable ? '存在右半平面极点，响应发散' : '极点位于虚轴，等幅振荡') + '，无稳态值；本表由阶跃响应数值积分得到',
      };
    }
    let ymax = -Infinity, tpeak = 0;
    ys.forEach((y, i) => { if (y > ymax) { ymax = y; tpeak = ts[i]; } });
    const amp = Math.abs(yss) > 1e-9 ? Math.abs(yss) : 1;
    const sigma = (ymax - yss) / amp * 100;
    const hasPeak = (ymax - yss) > 1e-3 * amp;
    const y10 = 0.1 * yss, y90 = 0.9 * yss;
    let tr = NaN, t10 = null;
    for (let i = 0; i < ys.length; i++) {
      if (t10 == null && ((yss >= 0 && ys[i] >= y10) || (yss < 0 && ys[i] <= y10))) t10 = ts[i];
      if (t10 != null && ((yss >= 0 && ys[i] >= y90) || (yss < 0 && ys[i] <= y90))) { tr = ts[i] - t10; break; }
    }
    let ts2 = NaN;
    for (let i = ys.length - 1; i >= 0; i--) {
      if (Math.abs(ys[i] - yss) > 0.02 * amp) { ts2 = (i + 1 < ts.length) ? ts[i + 1] : ts[i]; break; }
    }
    return {
      title: '时域性能指标（数值）',
      head: ['指标', '值'],
      rows: [
        ['稳态值 y∞（单位阶跃）', f4(yss)],
        ['σ%（超调量）', f4(Math.max(0, sigma))],
        ['tp（峰值时间 s）', hasPeak ? f4(tpeak) : '—（无超调）'],
        ['tr（上升时间 10%→90% s）', isFinite(tr) ? f4(tr) : '—'],
        ['ts(2%)（调节时间 s）', isFinite(ts2) ? f4(ts2) : '—'],
      ],
      note: '分母 ' + arrStr(den) + ' 非标准二阶，改为对单位阶跃响应做四阶龙格库塔数值积分求指标'
        + '（' + N + ' 步，t∈[0,' + f4(tMax) + ']）；若需二阶解析公式，请确认系统确为二阶',
    };
  }

  function perfTable(params) {
    const tf = closedLoopOf(params);
    if (!tf || !tf.den) return null;
    if (tf.den.length === 3) return perfSecondOrder(tf);
    if (tf.den.length >= 2) return perfNumeric(tf);
    return null;
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
    // 含符号系数：给出符号特征方程与稳定参数范围（不再要求纯数值）
    if (symTF(params)) {
      const st = symbolicRouthTable(params);
      if (st) return st;
    }
    const tf = closedLoopOf(params);
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
    const ss = mainSS(params);
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
      note: params.ss ? '由题面给出的 A/B/C/D 直接呈现为 LaTeX 矩阵'
        : '由传递函数自动构造可控标准型 (A,B,C,D) 后呈现为 LaTeX 矩阵',
    };
  }

  function sscharTable(params) {
    const ss = mainSS(params);
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
      note: 'A 的特征多项式（Faddeev–LeVerrier）：' + arrStr(charPoly(ss.A)) + ' 的根'
        + (params.ss ? '' : '（A 由传递函数可控标准型给出）'),
    };
  }

  function ctrboTable(params) {
    const ss = mainSS(params);
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

  // 复用绘图引擎的奈奎斯特数圈结论（P/N/Z）落表
  function encircTable(params) {
    const tf = openLoopOf(params);
    if (!tf || !tf.num || !tf.den || tf.symbolic || tf.den.length < 2) return null;
    const c = MQP().nyquistCount(tf.num, tf.den, { wMin: 0.01, wMax: 100, samples: 1200 });
    if (!c) return null;
    const rows = [
      ['P（开环右半平面极点数）', String(c.P)],
      ['N（逆时针绕 −1 的圈数）', String(c.N)],
      ['Z = P − N（闭环右半平面极点数）', String(c.Z)],
      ['闭环稳定性', c.Z === 0 ? '稳定（Z = 0）' : '不稳定（Z = ' + c.Z + '）'],
    ];
    if (c.imagAxisPole) rows.push(['备注', '开环含虚轴极点，严格结论需按凹形绕行修正，此处为数值近似']);
    return {
      title: '奈奎斯特判据（P/N/Z）',
      head: ['量', '值'],
      rows: rows,
      note: '对开环 ' + arrStr(tf.num) + '/' + arrStr(tf.den) + ' 数值扫描并数逆时针圈数，按 Z = P − N 判定闭环稳定',
    };
  }

  // 复用绘图引擎的相平面平衡点分类结论落表
  function eqtypeTable(params) {
    const ss = mainSS(params);
    if (!ss || !ss.A) return null;
    const c = MQP().classifyEquilibrium2(ss.A);
    if (!c) return null;
    const eigTxt = c.eigs.map(e => (e && typeof e === 'object') ? cplx(e) : f4(e)).join('、');
    return {
      title: '相平面平衡点类型',
      head: ['量', '值'],
      rows: [
        ['tr A（迹）', f4(c.tr)],
        ['det A（行列式）', f4(c.det)],
        ['判别式 tr² − 4det', f4(c.disc)],
        ['特征值', eigTxt],
        ['平衡点类型', c.type],
      ],
      note: '由 2×2 系统矩阵 A 的迹与行列式分类平衡点（稳定/不稳定结点、焦点、鞍点、中心）',
    };
  }

  // 根轨迹特征量：开环极点/零点、渐近线、实轴分离点、与虚轴交点/临界增益。
  // 增益参数自动识别（分子中的单参数），不限 K；纯数值开环时增益记为 K。
  function locusTable(params) {
    const tf = openLoopOf(params);
    if (!tf || (!tf.den && !tf.sden)) return null;
    let den, num0, gainParam = null;
    if (tf.symbolic) {
      const sym = symTF(params);
      if (!sym || sym !== tf) return null;
      if (pParams(tf.sden).length > 0) return null;         // 参数在分母：非经典增益根轨迹
      den = tf.sden.map(c => scValue(c));
      if (den.some(v => v == null)) return null;
      const gps = pParams(tf.snum);
      if (gps.length !== 1) return null;
      gainParam = gps[0];
      num0 = numNumericFromSym(tf.snum, gainParam);
    } else {
      den = tf.den;
      num0 = tf.num;
    }
    if (!den || den.length < 2 || !num0 || num0.length < 1) return null;
    if (num0.length > den.length) return null;               // 非真分式，无经典根轨迹
    const poles = MQP().polyRoots(den);
    const zeros = num0.length >= 2 ? MQP().polyRoots(num0) : [];
    const n = den.length - 1, m = num0.length - 1;
    const rows = [];
    rows.push(['开环极点', poles.length ? poles.map(cplx).join('、') : '无']);
    rows.push(['开环零点', zeros.length ? zeros.map(cplx).join('、') : '无']);
    if (n > m) {
      const cnt = n - m;
      const sumP = poles.reduce((s, p) => s + p.re, 0);
      const sumZ = zeros.reduce((s, z) => s + z.re, 0);
      const angles = [];
      for (let k = 0; k < cnt; k++) angles.push(f4((2 * k + 1) * 180 / cnt) + '°');
      rows.push(['渐近线条数 n−m', String(cnt)]);
      rows.push(['渐近线交点 σa', f4((sumP - sumZ) / cnt)]);
      rows.push(['渐近线倾角', angles.join('、')]);
    } else {
      rows.push(['渐近线', 'n ≤ m：无渐近线']);
    }
    // 分离/汇合点：dK/ds = 0 的实根，仅保留落在实轴根轨迹上的点（右侧实极点+零点数为奇数）
    const eqz = pnAdd(MQP().polyMul(pDeriv(den), num0), MQP().polyMul(den, pDeriv(num0)).map(v => -v));
    const realPZ = [];
    poles.forEach(p => { if (Math.abs(p.im) < 1e-7) realPZ.push(p.re); });
    zeros.forEach(z => { if (Math.abs(z.im) < 1e-7) realPZ.push(z.re); });
    const onLocus = x => realPZ.filter(v => v > x).length % 2 === 1;
    const breakPts = eqz.some(v => Math.abs(v) > 1e-12)
      ? MQP().polyRoots(eqz).filter(r => Math.abs(r.im) < 1e-7).map(r => r.re)
        .filter(onLocus).sort((a, b) => a - b)
      : [];
    rows.push(['分离/汇合点（实轴）', breakPts.length ? breakPts.map(f4).join('、') : '无']);
    // 与虚轴交点 & 临界增益：den + K·num0 的 s=jω 穿越（num0 右对齐到 den 的次数）
    const numAlign = new Array(den.length).fill(0);
    for (let i = 0; i < num0.length; i++) numAlign[den.length - num0.length + i] = num0[i];
    const cross = crossingsFromPairs(den.map((c, j) => [c, numAlign[j]])).filter(x => x.p > -1e-9);
    const uniqBy = (arr, f) => {
      const out = [];
      arr.forEach(v => { if (!out.some(u => Math.abs(f(u) - f(v)) < 1e-6)) out.push(v); });
      return out;
    };
    if (cross.length) {
      rows.push(['与虚轴交点 ω（rad/s）', uniqBy(cross, x => x.w).map(x => f4(x.w)).join('、')]);
      rows.push(['临界增益 ' + (gainParam || 'K'), uniqBy(cross, x => x.p).map(x => f4(x.p)).join('、')]);
    } else {
      rows.push(['与虚轴交点', '未找到（根轨迹不与虚轴相交）']);
    }
    return {
      title: '根轨迹特征量',
      head: ['量', '值'],
      rows: rows,
      note: '开环极点/零点与特征方程 ' + (gainParam || 'K') + '·num0 + den = 0 直接给出；'
        + '渐近线、分离点、与虚轴交点由多项式代数求得，增益参数自动识别，不限 K',
    };
  }

  const TABLE_BUILDERS = {
    poles: polesTable, perf: perfTable, routh: routhTable, steady: steadyTable,
    margins: marginsTable, freqs: freqsTable, coeffs: coeffsTable,
    ssmat: ssmatTable, sschar: sscharTable, ctrbo: ctrboTable,
    encirc: encircTable, eqtype: eqtypeTable, locus: locusTable,
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
      case 'tfopen': return !!openLoopOf(params);
      case 'eq': return !!params.eq;
      case 'ss': return !!mainSS(params);
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
      const ss = mainSS(params);
      if (!ss || !ss.A) return null;
      const n = ss.n || ss.A.length;
      const Bcol = ss.B ? matToStr(ss.B) : Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)).join('; ');
      const Crow = ss.C ? matToStr(ss.C) : Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)).join(', ');
      return { A: matToStr(ss.A), B: Bcol, C: Crow, D: ss.D ? matToStr(ss.D) : '0',
        u: 'step', x0: '1, 0', tMax: '8', samples: '800', label: '状态响应（n=' + n + '）' };
    }
    const tf = (kind === 'nyquist' || kind === 'rootlocus' || kind === 'nichols') ? openLoopOf(params) : closedLoopOf(params);
    if (!tf || tf.symbolic) return null;   // 含符号参数需先代入数值才能绘图
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
        hint: fields ? '' : (missing.length ? missing.map(n => NEED_TEXT[n]).filter(Boolean).join('；')
          : '参数含符号系数，需先代入数值才能生成该图'),
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
    extractParams, extractTF, extractTFList, extractOpenLoop, extractClosedLoop,
    extractDiffEq, extractStateSpace, extractSpec,
    // 表格层
    buildTable, locusTable,
    // 派生与互推
    mainTF: mainTF, mainSS: mainSS, tfToSS: tfToSS,
    closedLoopOf: closedLoopOf, openLoopOf: openLoopOf,
    closedFromOpen: closedFromOpen, openFromClosed: openFromClosed,
    // 符号系数
    symTF: symTF, charSym: charSym, stableRange: stableRange, symbolicRouthTable: symbolicRouthTable,
    scNum, scVar, scAdd, scScale, scMul, scEval, scText, scParams, scValue, scIsZero,
    pAdd, pMul, pPow, pParams, pIsNum,
    // 解析工具
    normalizeTex, fracToExpr, splitNumDen, insertMul, polyInStr, rationalCoeffs, rationalSym,
    // 矩阵工具
    matrixFromTex, matrixRank, charPoly, eigenValues, ctrbRank, obsvRank,
  };
});
