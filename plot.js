/* =========================================================
   自控 · 现控 复习本 · plot.js
   绘图模块：表达式编译、多项式求根、频域响应 以及 canvas 绘图。

   设计要点
   ---------
   1) 纯逻辑（表达式解析/编译、polyRoots、evalPoly、polyMul/polyAdd、频域响应、
      可控标准型建模、四阶龙格库塔积分）与 DOM 完全无关，可在 Node 下直接单测；
      绘图（drawPlot）只在【被调用时】接触 canvas，文件顶层不执行任何 canvas 代码。
   2) 浏览器以经典脚本加载：<script src="./plot.js"></script>，命名空间挂到 window.MQP。
      同时兼容 Node：const MQP = require('./plot.js')。
      使用 import/export、任何构建工具或外部库/ CDN 均被禁止。

   —— 表达式编译约定（供需要表达式求值的图型复用）——
   MQP.compileExpr(src) 必须【返回一个函数】f(vars)：
     * vars 形如 {t:1.5} / {w:2}，返回 number；
     * 表达式非法时抛 new Error('中文说明')；绝不返回对象，也绝不返回 null/undefined。
   MQP.tryCompileExpr(src) 返回 {ok:true, fn} 或 {ok:false, error:'中文说明'}。
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MQP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* =========================================================
     一、表达式解析与编译（纯函数）
     支持：数字（含科学计数法）、+ - * / ^、括号、一元负号；
           常量 pi/PI/e；变量 t/w(omega)；
           一元函数 sin…round。
     ========================================================= */
  const CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E };
  // 变量别名：omega 归一到 w
  const VAR_NAMES = { t: 't', w: 'w', omega: 'w' };

  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp,
    ln: Math.log, log: Math.log, log10: Math.log10,
    sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
  };

  // 词法分析
  function tokenize(src) {
    const s = String(src);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch >= '0' && ch <= '9' || ch === '.') {
        const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('数字格式错误：' + s.slice(i, i + 8));
        out.push({ type: 'num', value: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
        out.push({ type: 'ident', value: m[0] });
        i += m[0].length;
        continue;
      }
      if ('+-*/^(),'.indexOf(ch) >= 0) {
        const type = ch === '(' ? 'lparen' : ch === ')' ? 'rparen' : ch === ',' ? 'comma' : 'op';
        out.push({ type: type, value: ch });
        i++;
        continue;
      }
      throw new Error('无法识别的字符：' + ch);
    }
    return out;
  }

  // 语法分析（递归下降），返回 AST
  function parseTokens(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];

    function parseExpr() {
      let node = parseTerm();
      let t = peek();
      while (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        pos++;
        node = { op: t.value, a: node, b: parseTerm() };
        t = peek();
      }
      return node;
    }
    function parseTerm() {
      let node = parseUnary();
      let t = peek();
      while (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        pos++;
        node = { op: t.value, a: node, b: parseUnary() };
        t = peek();
      }
      return node;
    }
    function parseUnary() {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '-' || t.value === '+')) {
        pos++;
        const v = parseUnary();
        return t.value === '-' ? { op: 'neg', a: v } : v;
      }
      return parsePower();
    }
    function parsePower() {
      const base = parseAtom();
      const t = peek();
      if (t && t.type === 'op' && t.value === '^') {
        pos++;
        return { op: '^', a: base, b: parseUnary() }; // 右结合，指数允许一元负号
      }
      return base;
    }
    function parseAtom() {
      const t = peek();
      if (!t) throw new Error('表达式不完整（缺少运算数）');
      if (t.type === 'num') { pos++; return { num: t.value }; }
      if (t.type === 'ident') {
        pos++;
        const name = t.value;
        const isCall = peek() && peek().type === 'lparen';
        if (isCall) {
          if (!Object.prototype.hasOwnProperty.call(FUNCS, name)) throw new Error('未知函数：' + name);
          pos++; // 吃掉 '('
          const arg = parseExpr();
          const c = peek();
          if (!c || c.type !== 'rparen') throw new Error('括号不匹配，缺少 “)”');
          pos++;
          return { fn: name, a: arg };
        }
        if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return { num: CONSTS[name] };
        if (Object.prototype.hasOwnProperty.call(VAR_NAMES, name)) return { var: VAR_NAMES[name] };
        if (Object.prototype.hasOwnProperty.call(FUNCS, name)) throw new Error('函数 “' + name + '” 缺少括号');
        throw new Error('未知变量或函数：' + name);
      }
      if (t.type === 'lparen') {
        pos++;
        const node = parseExpr();
        const c = peek();
        if (!c || c.type !== 'rparen') throw new Error('括号不匹配，缺少 “)”');
        pos++;
        return node;
      }
      throw new Error('意外的符号：' + (t.value == null ? '' : t.value));
    }

    const ast = parseExpr();
    if (pos !== tokens.length) throw new Error('表达式存在多余内容：' + tokens[pos].value);
    return ast;
  }

  function evalNode(node, vars) {
    if (node.num !== undefined) return node.num;
    if (node.var !== undefined) {
      const v = vars[node.var];
      return (v === undefined || v === null) ? 0 : Number(v);
    }
    if (node.fn !== undefined) return FUNCS[node.fn](evalNode(node.a, vars));
    const a = evalNode(node.a, vars);
    if (node.op === 'neg') return -a;
    const b = evalNode(node.b, vars);
    switch (node.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      case '^': return Math.pow(a, b);
      default: return NaN;
    }
  }

  // 编译表达式：成功返回 function f(vars)→number；非法则抛 Error（中文）
  function compileExpr(src) {
    const s = String(src == null ? '' : src);
    if (!s.trim()) throw new Error('表达式不能为空');
    const tokens = tokenize(s);
    if (!tokens.length) throw new Error('表达式不能为空');
    const ast = parseTokens(tokens);
    return function f(vars) {
      return evalNode(ast, vars && typeof vars === 'object' ? vars : {});
    };
  }

  // 供 UI 表单使用：绝不抛异常
  function tryCompileExpr(src) {
    try {
      return { ok: true, fn: compileExpr(src) };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : '表达式非法' };
    }
  }

  /* =========================================================
     二、多项式（按降幂排列的实系数数组，纯函数）
     ========================================================= */
  function toCoeffs(a) { return Array.isArray(a) ? a.map(function (v) { return Number(v); }) : []; }
  function trimLead(a) {
    let i = 0;
    while (i < a.length - 1 && a[i] === 0) i++;
    return a.slice(i);
  }

  // 复系数 Horner 求值；z 可为数字或 {re,im}
  function evalPoly(coeffs, z) {
    const a = toCoeffs(coeffs);
    const isObj = !!(z && typeof z === 'object');
    const zr = isObj ? Number(z.re) : Number(z);
    const zi = isObj ? (z.im == null ? 0 : Number(z.im)) : 0;
    let rr = 0, ri = 0;
    for (let i = 0; i < a.length; i++) {
      const nr = rr * zr - ri * zi + a[i];
      const ni = rr * zi + ri * zr;
      rr = nr; ri = ni;
    }
    if (isObj) return { re: rr, im: ri };
    return rr;
  }

  // 降幂系数多项式相乘
  function polyMul(a, b) {
    const A = toCoeffs(a), B = toCoeffs(b);
    if (!A.length || !B.length) return [0];
    const out = new Array(A.length + B.length - 1).fill(0);
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B.length; j++) out[i + j] += A[i] * B[j];
    }
    return out;
  }

  // 降幂系数多项式相加
  function polyAdd(a, b) {
    const A = toCoeffs(a), B = toCoeffs(b);
    const n = Math.max(A.length, B.length);
    while (A.length < n) A.unshift(0);
    while (B.length < n) B.unshift(0);
    const out = A.map(function (v, i) { return v + B[i]; });
    return out;
  }

  // Durand–Kerner 求全部复根 → [{re, im}, ...]
  function polyRoots(coeffs) {
    let a = trimLead(toCoeffs(coeffs));
    if (a.length < 2) return [];
    const n = a.length - 1;
    const lead = a[0];
    if (!isFinite(lead) || lead === 0) return [];
    const c = a.map(function (v) { return v / lead; }); // 首一化

    function fz(xr, xi) {
      let rr = c[0], ri = 0;
      for (let k = 1; k <= n; k++) {
        const nr = rr * xr - ri * xi + c[k];
        const ni = rr * xi + ri * xr;
        rr = nr; ri = ni;
      }
      return [rr, ri];
    }

    // 初值 z_k = (0.4 + 0.9i)^(k+1)
    const R = new Array(n), I = new Array(n);
    let pr = 0.4, pi = 0.9;
    for (let k = 0; k < n; k++) {
      R[k] = pr; I[k] = pi;
      const tr = pr * 0.4 - pi * 0.9;
      const ti = pr * 0.9 + pi * 0.4;
      pr = tr; pi = ti;
    }

    const tol = 1e-14;
    for (let it = 0; it < 1000; it++) {
      let maxd = 0;
      for (let k = 0; k < n; k++) {
        const f = fz(R[k], I[k]);
        let dr = 1, di = 0;
        for (let j = 0; j < n; j++) {
          if (j === k) continue;
          const ar = R[k] - R[j], ai = I[k] - I[j];
          const tr = dr * ar - di * ai;
          const ti = dr * ai + di * ar;
          dr = tr; di = ti;
        }
        const den = dr * dr + di * di;
        if (den === 0) continue;
        const qr = (f[0] * dr + f[1] * di) / den;
        const qi = (f[1] * dr - f[0] * di) / den;
        R[k] -= qr; I[k] -= qi;
        const m = qr * qr + qi * qi;
        if (m > maxd) maxd = m;
      }
      if (maxd < tol * tol) break;
    }

    const roots = [];
    for (let k = 0; k < n; k++) {
      let re = R[k], im = I[k];
      if (Math.abs(im) < 1e-9) im = 0;
      if (Math.abs(re) < 1e-9) re = 0;
      roots.push({ re: re, im: im });
    }
    roots.sort(function (p, q) { return (p.re - q.re) || (p.im - q.im); });
    return roots;
  }

  /* =========================================================
     三、绘图（仅在 drawPlot 被调用时接触 canvas；Node 下安全降级）
     ========================================================= */
  function getCtx(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    try { return canvas.getContext('2d'); } catch (e) { return null; }
  }
  function num(v, d) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  }

  function theme(dark, color) {
    const t = dark
      ? {
        bg: '#0f151c', panel: '#131c26', border: '#26343f', grid: '#1e2b38',
        axis: '#5b6d7f', zero: '#8fa3b6', text: '#c3d0dd', muted: '#7d8fa0',
        curve: '#4ea1f7', stem: '#8be28b', pole: '#ff6b8a', zeroMark: '#4ea1f7',
      }
      : {
        bg: '#ffffff', panel: '#f7f9fc', border: '#d5dee8', grid: '#e6ecf3',
        axis: '#8a99a8', zero: '#5b6d7f', text: '#33404d', muted: '#71828f',
        curve: '#1b7fe0', stem: '#2e9e4f', pole: '#d63b5e', zeroMark: '#1b7fe0',
      };
    if (typeof color === 'string' && color) t.curve = color;
    return t;
  }

  function mapX(box, x, x0, x1) { return box.x + (x - x0) / (x1 - x0) * box.w; }
  function mapY(box, y, y0, y1) { return box.y + box.h - (y - y0) / (y1 - y0) * box.h; }

  function niceStep(target) {
    if (!(target > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / mag;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * mag;
  }
  function niceTicks(min, max, count) {
    if (!(max > min)) return [min];
    const step = niceStep((max - min) / (count || 5));
    const ticks = [];
    const start = Math.ceil(min / step) * step;
    for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return ticks;
  }
  function intTicks(min, max, count) {
    const span = max - min;
    let step = Math.max(1, Math.round(niceStep(span / (count || 8))));
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v === 0 ? 0 : v);
    return out;
  }
  function fmtTick(v) {
    if (Math.abs(v) < 1e-9) return '0';
    if (Math.abs(v) >= 10000 || Math.abs(v) < 0.001) return v.toExponential(0);
    return String(Math.round(v * 1000) / 1000);
  }
  function niceRange(lo, hi) {
    if (!(hi > lo)) {
      const c = (hi + lo) / 2 || 0;
      const half = Math.abs(c) > 0 ? Math.abs(c) : 1;
      lo = c - half; hi = c + half;
    }
    const pad = (hi - lo) * 0.12;
    return [lo - pad, hi + pad];
  }

  // 画面板：底、网格、边框、零轴、刻度数字
  function drawAxis(ctx, box, xr, yr, th, xLabel) {
    ctx.fillStyle = th.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);

    const xt = niceTicks(xr[0], xr[1], 6);
    const yt = niceTicks(yr[0], yr[1], 4);

    ctx.save();
    ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.beginPath();
    xt.forEach(function (v) {
      const px = Math.round(mapX(box, v, xr[0], xr[1])) + 0.5;
      ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h);
    });
    yt.forEach(function (v) {
      const py = Math.round(mapY(box, v, yr[0], yr[1])) + 0.5;
      ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py);
    });
    ctx.stroke();
    ctx.restore();

    // 零轴
    ctx.save();
    ctx.strokeStyle = th.zero; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (yr[0] < 0 && yr[1] > 0) {
      const py = Math.round(mapY(box, 0, yr[0], yr[1])) + 0.5;
      ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py);
    }
    if (xr[0] < 0 && xr[1] > 0) {
      const px = Math.round(mapX(box, 0, xr[0], xr[1])) + 0.5;
      ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h);
    }
    ctx.stroke();
    ctx.restore();

    // 边框
    ctx.strokeStyle = th.border; ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

    // 刻度数字
    ctx.fillStyle = th.muted;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach(function (v) {
      const px = mapX(box, v, xr[0], xr[1]);
      if (px >= box.x - 1 && px <= box.x + box.w + 1) ctx.fillText(fmtTick(v), px, box.y + box.h + 4);
    });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach(function (v) {
      const py = mapY(box, v, yr[0], yr[1]);
      if (py >= box.y - 1 && py <= box.y + box.h + 1) ctx.fillText(fmtTick(v), box.x - 6, py);
    });

    if (xLabel) {
      ctx.fillStyle = th.muted;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(xLabel, box.x + box.w, box.y + box.h + 30);
    }
  }

  function drawLabel(ctx, box, text, th) {
    if (!text) return;
    ctx.fillStyle = th.text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(String(text), box.x + 8, box.y + 6);
  }

  function notice(ctx, box, msg, th) {
    ctx.fillStyle = th.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = th.pole;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, box.x + box.w / 2, box.y + box.h / 2);
  }

  function clipBox(ctx, box, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    fn();
    ctx.restore();
  }

  function drawCurve(ctx, box, pts, xr, yr, color, lw) {
    clipBox(ctx, box, function () {
      ctx.strokeStyle = color; ctx.lineWidth = lw || 1.6;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!isFinite(p.y)) { pen = false; continue; }
        const px = mapX(box, p.x, xr[0], xr[1]);
        const py = mapY(box, p.y, yr[0], yr[1]);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }

  function drawStem(ctx, box, pts, xr, yr, color) {
    clipBox(ctx, box, function () {
      const py0 = Math.max(box.y, Math.min(box.y + box.h, mapY(box, 0, yr[0], yr[1])));
      ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!isFinite(p.y)) continue;
        const px = mapX(box, p.x, xr[0], xr[1]);
        const py = mapY(box, p.y, yr[0], yr[1]);
        ctx.moveTo(px, py0); ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!isFinite(p.y)) continue;
        const px = mapX(box, p.x, xr[0], xr[1]);
        const py = mapY(box, p.y, yr[0], yr[1]);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function panelBox(W, H, m) {
    return { x: m.l, y: m.t, w: W - m.l - m.r, h: H - m.t - m.b };
  }

  /* =========================================================
     以下为控制课程用图型：时域响应 / Bode / 奈奎斯特 / 尼科尔斯 /
     根轨迹 / 零极点 / 状态响应 / 相平面
     ========================================================= */

  // 频率响应 H(jω)（s 域）或 H(e^{jω})（z 域）
  function freqResp(numC, denC, w, domain) {
    const z = domain === 'z' ? { re: Math.cos(w), im: Math.sin(w) } : { re: 0, im: w };
    return cdiv(evalPoly(numC, z), evalPoly(denC, z));
  }

  // 相位按 180° 跳变展开成连续曲线（频域图用）
  function unwrapPhase(pts) {
    const out = [];
    let off = 0, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const raw = pts[i];
      if (prev != null) {
        let d = raw - prev;
        if (d > 180) off -= 360; else if (d < -180) off += 360;
      }
      out.push(raw + off);
      prev = raw;
    }
    return out;
  }

  // 多条曲线时用的配色
  function palette(n) {
    const base = ['#1b7fe0', '#d63b5e', '#2e9e4f', '#e08a2e', '#7048c4', '#0f9aa8', '#b0308f', '#5b6d7f'];
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(i < base.length ? base[i] : 'hsl(' + Math.round((i * 137.508) % 360) + ',62%,48%)');
    }
    return out;
  }

  // 2×2 / 1×n 等矩阵的文本形式（标注用）
  function matText(M) {
    if (!Array.isArray(M)) return String(M);
    return '[' + M.map(function (r) { return Array.isArray(r) ? r.join(' ') : String(r); }).join('; ') + ']';
  }

  // 把降幂系数写成纯文本多项式，如 [1, 3, 2] + 's' → "s^2 + 3s + 2"
  function polyText(c, v) {
    const co = toCoeffs(c);
    const deg = co.length - 1;
    const parts = [];
    for (let i = 0; i < co.length; i++) {
      const k = co[i], p = deg - i;
      if (!isFinite(k) || Math.abs(k) < 1e-12) continue;
      const mag = Math.abs(k) === 1 ? '' : String(Math.round(k * 1000) / 1000);
      const term = mag + (p === 0 ? '' : p === 1 ? v : v + '^' + p);
      parts.push((parts.length ? (k > 0 ? ' + ' : ' − ') : (k < 0 ? '−' : '')) + term);
    }
    return parts.join('') || '0';
  }
  function tfText(numC, denC, v) {
    const V = v || 's';
    return 'G(' + V + ') = (' + polyText(numC, V) + ') / (' + polyText(denC, V) + ')';
  }
  function polyScale(c, k) {
    return toCoeffs(c).map(function (x) { return x * k; });
  }

  // 纯函数：数开环 G(jω) 曲线绕 (−1, j0) 的逆时针圈数 → { P, N, Z, stable, imagAxisPole, ok }
  // P：开环右半平面极点数；N：逆时针圈数；Z = P − N：闭环右半平面极点数
  function nyquistCount(numC, denC, opts) {
    const numA = trimLead(toCoeffs(numC)), denA = trimLead(toCoeffs(denC));
    if (!numA.length || denA.length < 2) return null;
    const o = opts || {};
    const wMin = Math.max(1e-4, num(o.wMin, 0.01));
    const wMax = num(o.wMax, 100);
    const N = Math.max(20, Math.floor(num(o.samples, 400)));
    const Hc = [];
    for (let i = 0; i < N; i++) {
      const w = wMin + (wMax - wMin) * i / (N - 1);
      Hc.push(freqResp(numA, denA, w, 's'));
    }
    const poles = polyRoots(denA);
    const P = poles.filter(function (p) { return p.re > 1e-9; }).length;
    const mirror = [];
    for (let i = N - 1; i >= 0; i--) mirror.push({ x: Hc[i].re, y: -Hc[i].im });
    const main = Hc.map(function (h) { return { x: h.re, y: h.im }; })
      .filter(function (p) { return isFinite(p.x) && isFinite(p.y); });
    let total = 0, ok = true;
    const seq = mirror.map(function (p) { return { x: p.x + 1, y: p.y }; })
      .concat(main.map(function (p) { return { x: p.x + 1, y: p.y }; }));
    for (let i = 1; i < seq.length; i++) {
      const a0 = Math.atan2(seq[i - 1].y, seq[i - 1].x);
      const a1 = Math.atan2(seq[i].y, seq[i].x);
      if (!isFinite(a0) || !isFinite(a1)) { ok = false; break; }
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      total += d;
    }
    const Nw = ok ? Math.round(total / (2 * Math.PI)) : 0;
    const Z = P - Nw;
    const imagAxisPole = poles.some(function (p) { return Math.abs(p.re) <= 1e-9; });
    return { P: P, N: Nw, Z: Z, stable: Z === 0, imagAxisPole: imagAxisPole, ok: ok };
  }

  // 纯函数：2×2 系统矩阵 → 平衡点类型（迹/行列式判别）→ { tr, det, disc, type, eigs }
  function classifyEquilibrium2(A) {
    if (!Array.isArray(A) || A.length !== 2 || !Array.isArray(A[0]) || A[0].length !== 2) return null;
    const tr = Number(A[0][0]) + Number(A[1][1]);
    const det = Number(A[0][0]) * Number(A[1][1]) - Number(A[0][1]) * Number(A[1][0]);
    const disc = tr * tr - 4 * det;
    let type, eigs;
    if (disc >= 0) {
      const s1 = (tr + Math.sqrt(disc)) / 2, s2 = (tr - Math.sqrt(disc)) / 2;
      eigs = [s1, s2];
      type = (s1 < -1e-9 && s2 < -1e-9) ? '稳定结点（两特征值均负，收敛）'
        : (s1 > 1e-9 && s2 > 1e-9) ? '不稳定结点（两特征值均正，发散）'
          : '鞍点（特征值异号，不稳定）';
    } else {
      const re = tr / 2, im = Math.sqrt(-disc) / 2;
      eigs = [{ re: re, im: im }, { re: re, im: -im }];
      type = re < -1e-9 ? '稳定焦点（共轭特征值实部为负，收敛振荡）'
        : re > 1e-9 ? '不稳定焦点（共轭特征值实部为正，发散振荡）'
          : '中心（纯虚特征值，等幅振荡）';
    }
    return { tr: tr, det: det, disc: disc, type: type, eigs: eigs };
  }

  // 由 s 域分子/分母系数建立可控标准型状态空间（A,B,C,D）
  function ssFromTF(numC, denC) {
    const den = trimLead(toCoeffs(denC));
    const numRaw = trimLead(toCoeffs(numC));
    if (den.length < 2 || den[0] === 0) throw new Error('分母至少写成一阶以上，如 [1, 1]');
    if (!numRaw.length) throw new Error('分子系数不能为空');
    if (numRaw.length > den.length) throw new Error('分子阶数不能高于分母（请填真分式）');
    const n = den.length - 1;
    const a = den.slice(1).map(function (v) { return v / den[0]; });   // a1..an（降幂）
    const b = numRaw.map(function (v) { return v / den[0]; });         // b0..bm
    while (b.length < n + 1) b.unshift(0);                             // 左侧补 0，对齐到 b0..bn
    const A = [], B = new Array(n).fill(0), C = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(n).fill(0);
      if (i < n - 1) row[i + 1] = 1;
      else for (let j = 0; j < n; j++) row[j] = -a[n - 1 - j];
      A.push(row);
    }
    B[n - 1] = 1;
    for (let k = 0; k < n; k++) C.push(b[n - k] - b[0] * a[n - k - 1]);
    return { A: A, B: B, C: C, D: b[0], n: n };
  }

  // 四阶龙格库塔积分 ẋ = Ax + Bu（u 为空表 u≡0，可为常数或 t 的函数）→ { xs, dt }
  function integrateRK4(sys, x0, tMax, N, uFn) {
    const n = sys.n, A = sys.A, B = sys.B;
    const dt = tMax / N;
    const uAt = function (t) {
      if (typeof uFn === 'function') return uFn(t);
      return (uFn == null) ? 0 : uFn;
    };
    const mul = function (v) {
      const out = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i][j] * v[j]; out[i] = s; }
      return out;
    };
    const step = function (p, q, k) { return p.map(function (v, i) { return v + k * q[i]; }); };
    const f = function (x, t) {
      const Ax = mul(x);
      const u = uAt(t);
      if (!u) return Ax;
      return Ax.map(function (v, i) { return v + B[i] * u; });
    };
    const xs = [x0.slice()];
    let x = x0.slice();
    for (let i = 0; i < N; i++) {
      const t = i * dt;
      const k1 = f(x, t);
      const k2 = f(step(x, k1, dt / 2), t + dt / 2);
      const k3 = f(step(x, k2, dt / 2), t + dt / 2);
      const k4 = f(step(x, k3, dt), t + dt);
      x = x.map(function (v, j) { return v + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]); });
      xs.push(x.slice());
    }
    return { xs: xs, dt: dt };
  }

  // 时域响应：单位阶跃 / 单位冲激（初值法近似）/ 单位斜坡
  function drawStep(ctx, W, H, s, th) {
    const box = panelBox(W, H, { l: 60, r: 20, t: 28, b: 38 });
    const resp = (s.resp === 'impulse' || s.resp === 'ramp') ? s.resp : 'step';
    const impulse = resp === 'impulse';
    const isRamp = resp === 'ramp';
    const tMax = num(s.tMax, 10);
    const N = Math.max(20, Math.floor(num(s.samples, 600)));
    let sys;
    try { sys = ssFromTF(s.num, s.den); }
    catch (e) { notice(ctx, box, '系数错误：' + e.message, th); return; }

    // 阶跃/斜坡：零初值 + 相应输入；冲激：h(t)=C e^{At} B → 初值取 B、输入取 0
    const x0 = new Array(sys.n).fill(0);
    if (impulse) for (let i = 0; i < sys.n; i++) x0[i] = sys.B[i];
    const uFn = impulse ? null : (isRamp ? function (t) { return t; } : 1);
    const sim = integrateRK4(sys, x0, tMax, N, uFn);

    const pts = sim.xs.map(function (x, i) {
      let y = 0;
      for (let j = 0; j < sys.n; j++) y += sys.C[j] * x[j];
      const ut = impulse ? 0 : (isRamp ? i * sim.dt : 1);
      y += sys.D * ut;
      return { x: i * sim.dt, y: isFinite(y) ? y : NaN };
    });
    let lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (isFinite(p.y)) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; } });
    if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
    lo = Math.min(lo, 0); hi = Math.max(hi, 0);
    const yr = niceRange(lo, hi);
    const xr = [0, tMax];

    drawAxis(ctx, box, xr, yr, th, 't');
    // y = D 参考线（仅阶跃响应的稳态值）
    if (resp === 'step') {
      const y1 = mapY(box, sys.D, yr[0], yr[1]);
      if (y1 > box.y && y1 < box.y + box.h) {
        ctx.save();
        ctx.strokeStyle = th.muted; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(box.x, y1); ctx.lineTo(box.x + box.w, y1); ctx.stroke();
        ctx.restore();
      }
    }
    drawCurve(ctx, box, pts, xr, yr, th.curve, 1.8);

    const defLabel = impulse ? '单位冲激响应 h(t)' : (isRamp ? '单位斜坡响应 y(t)' : '单位阶跃响应 y(t)');
    let peak = pts[0];
    pts.forEach(function (p) { if (isFinite(p.y) && p.y > peak.y) peak = p; });
    drawLabel(ctx, box, (s.label || defLabel) + '　' + tfText(s.num, s.den), th);
    ctx.fillStyle = th.muted;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('峰值 ' + (Math.round(peak.y * 1000) / 1000) + ' @ t=' + (Math.round(peak.x * 100) / 100), box.x + 6, box.y + 6);
  }

  // 奈奎斯特图：开环 G(jω) 及其共轭镜像，并给出 P / N / Z 结论
  function drawNyquist(ctx, W, H, s, th) {
    const box = panelBox(W, H, { l: 56, r: 20, t: 28, b: 38 });
    const numC = trimLead(toCoeffs(s.num)), denC = trimLead(toCoeffs(s.den));
    if (!numC.length || denC.length < 2) { notice(ctx, box, '系数错误：请填写真分式的分子/分母系数', th); return; }
    const wMin = Math.max(1e-4, num(s.wMin, 0.01));
    const wMax = num(s.wMax, 100);
    const N = Math.max(20, Math.floor(num(s.samples, 400)));

    const wArr = [], Hc = [];
    for (let i = 0; i < N; i++) {
      const w = wMin + (wMax - wMin) * i / (N - 1);
      wArr.push(w); Hc.push(freqResp(numC, denC, w, 's'));
    }
    let reLo = -1, reHi = 0, imLo = 0, imHi = 0;
    Hc.forEach(function (h) {
      if (!isFinite(h.re) || !isFinite(h.im)) return;
      reLo = Math.min(reLo, h.re); reHi = Math.max(reHi, h.re);
      imLo = Math.min(imLo, h.im); imHi = Math.max(imHi, h.im);
    });
    // 对称扩展一点余量
    const reSpan = Math.max(1e-6, reHi - reLo);
    const imSpan = Math.max(1e-6, imHi - imLo);
    const span = Math.max(reSpan, imSpan) * 0.14;
    const xr = niceRange(reLo - span, reHi + span);
    const yr = niceRange(imLo - span, imHi + span);
    drawAxis(ctx, box, xr, yr, th, 'Re');

    // 镜像（ω<0，共轭）
    const mirror = [];
    for (let i = N - 1; i >= 0; i--) mirror.push({ x: Hc[i].re, y: -Hc[i].im });
    ctx.save();
    ctx.strokeStyle = th.muted; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    drawCurve(ctx, box, mirror.filter(function (p) { return isFinite(p.x) && isFinite(p.y); }), xr, yr, th.muted, 1.2);
    ctx.restore();
    const main = Hc.map(function (h) { return { x: h.re, y: h.im }; })
      .filter(function (p) { return isFinite(p.x) && isFinite(p.y); });
    drawCurve(ctx, box, main, xr, yr, th.curve, 1.8);

    // (−1, j0) 临界点
    const cx = mapX(box, -1, xr[0], xr[1]);
    const cy = mapY(box, 0, yr[0], yr[1]);
    ctx.save();
    ctx.strokeStyle = th.pole; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
    ctx.restore();

    // P/N/Z：复用纯函数 nyquistCount（与绘图共用同一套数圈逻辑）
    const cnt = nyquistCount(numC, denC, { wMin: wMin, wMax: wMax, samples: N });
    const P = cnt.P, Nw = cnt.N, Z = cnt.Z, imagAxisPole = cnt.imagAxisPole;

    drawLabel(ctx, box, (s.label || '奈奎斯特图') + '　' + tfText(s.num, s.den), th);
    ctx.fillStyle = Z === 0 ? th.stem : th.pole;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('P = ' + P + '（开环右半平面极点）　N = ' + Nw + '（逆时针绕 −1）　Z = P − N = ' + Z
      + '　→ ' + (Z === 0 ? '闭环稳定' : '闭环不稳定')
      + (imagAxisPole ? '（含虚轴极点，严格结论需凹形绕行，此处为近似）' : ''), W / 2, H - 8);
  }

  // 根轨迹：den + K·num = 0 的根随 K(0→∞) 移动
  function drawRootLocus(ctx, W, H, s, th) {
    const numC = trimLead(toCoeffs(s.num)), denC = trimLead(toCoeffs(s.den));
    if (!numC.length || denC.length < 2) { notice(ctx, panelBox(W, H, { l: 16, r: 16, t: 16, b: 16 }), '系数错误：请填写开环传递函数的分子/分母系数', th); return; }
    const kMax = Math.max(1e-6, num(s.kMax, 50));
    const N = Math.max(20, Math.floor(num(s.samples, 200)));

    const poles = polyRoots(denC), zeros = polyRoots(numC);
    const marks = [];
    for (let i = 0; i <= N; i++) {
      const K = kMax * Math.pow(i / N, 2);          // 靠近 K=0 更密
      const roots = polyRoots(polyAdd(denC, polyScale(numC, K)));
      roots.forEach(function (r) {
        if (isFinite(r.re) && isFinite(r.im)) marks.push({ x: r.re, y: r.im, k: K });
      });
    }
    let R = 1;
    marks.concat(poles).concat(zeros).forEach(function (p) {
      R = Math.max(R, Math.abs(p.re == null ? p.x : p.re), Math.abs(p.im == null ? p.y : p.im));
    });
    R = R * 1.15 + 0.3;
    const size = Math.max(140, Math.min(W - 90, H - 80));
    const box = { x: (W - size) / 2, y: 28, w: size, h: size };
    const xr = [-R, R], yr = [-R, R];
    drawAxis(ctx, box, xr, yr, th, null);

    // 稳定半平面（左半平面）浅色底
    const x0px = mapX(box, 0, xr[0], xr[1]);
    ctx.save();
    ctx.fillStyle = th.stem; ctx.globalAlpha = 0.06;
    ctx.fillRect(box.x, box.y, x0px - box.x, box.h);
    ctx.restore();

    // 轨迹点：颜色随 K 加深
    ctx.save();
    marks.forEach(function (m) {
      const px = mapX(box, m.x, xr[0], xr[1]);
      const py = mapY(box, m.y, yr[0], yr[1]);
      if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) return;
      ctx.globalAlpha = 0.14 + 0.86 * (m.k / kMax);
      ctx.fillStyle = th.curve;
      ctx.beginPath(); ctx.arc(px, py, 1.7, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // 开环极点 ×、开环零点 ○
    ctx.save();
    ctx.strokeStyle = th.pole; ctx.lineWidth = 2;
    poles.forEach(function (p) {
      const px = mapX(box, p.re, xr[0], xr[1]), py = mapY(box, p.im, yr[0], yr[1]), d = 5;
      ctx.beginPath();
      ctx.moveTo(px - d, py - d); ctx.lineTo(px + d, py + d);
      ctx.moveTo(px - d, py + d); ctx.lineTo(px + d, py - d);
      ctx.stroke();
    });
    ctx.strokeStyle = th.zeroMark;
    zeros.forEach(function (q) {
      const px = mapX(box, q.re, xr[0], xr[1]), py = mapY(box, q.im, yr[0], yr[1]);
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();

    const maxKRoots = polyRoots(polyAdd(denC, polyScale(numC, kMax)));
    const stableAtMax = maxKRoots.every(function (r) { return r.re < 1e-9; });
    drawLabel(ctx, box, (s.label ? s.label + '　' : '') + '根轨迹　× 开环极点　○ 开环零点　· 闭环极点（K: 0 → ' + kMax + '）', th);
    ctx.fillStyle = stableAtMax ? th.stem : th.pole;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText((stableAtMax ? 'K = ' + kMax + ' 时闭环极点全在左半平面（该增益下稳定）' : 'K = ' + kMax + ' 时存在右半平面闭环极点'), W / 2, H - 8);
  }

  function cdiv(a, b) {
    const d = b.re * b.re + b.im * b.im;
    if (d === 0) return { re: NaN, im: NaN };
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  }

  // 波特图：上幅频(dB) + 下相频(°) 两个子图
  function drawBode(ctx, W, H, s, th) {
    const domain = s.domain === 'z' ? 'z' : 's';
    const numC = toCoeffs(s.num), denC = toCoeffs(s.den);
    const wMin = num(s.wMin, domain === 'z' ? 0 : 0.01);
    const wMax = num(s.wMax, domain === 'z' ? Math.PI : 10);
    const N = Math.max(2, Math.floor(num(s.samples, 400)));
    const ws = [], dB = [], ph = [];
    for (let i = 0; i < N; i++) {
      const w = wMin + (wMax - wMin) * i / (N - 1);
      const z = domain === 'z' ? { re: Math.cos(w), im: Math.sin(w) } : { re: 0, im: w };
      const nv = evalPoly(numC, z), dv = evalPoly(denC, z);
      const Hc = cdiv(nv, dv);
      const mag = Math.hypot(Hc.re, Hc.im);
      ws.push(w);
      dB.push(isFinite(mag) && mag > 0 ? 20 * Math.log10(mag) : -160);
      ph.push(isFinite(Hc.re) && isFinite(Hc.im) ? Math.atan2(Hc.im, Hc.re) * 180 / Math.PI : 0);
    }
    const gap = 30;
    const m = { l: 54, r: 16, t: 24, b: 40 };
    const h = (H - m.t - m.b - gap) / 2;
    const top = { x: m.l, y: m.t, w: W - m.l - m.r, h: h };
    const bot = { x: m.l, y: m.t + h + gap, w: W - m.l - m.r, h: h };
    const dBpts = ws.map(function (w, i) { return { x: w, y: dB[i] }; });
    const phpts = ws.map(function (w, i) { return { x: w, y: ph[i] }; });
    const ydb = niceRange(Math.min.apply(null, dB), Math.max.apply(null, dB));
    const yph = [-180, 180];

    drawAxis(ctx, top, [wMin, wMax], ydb, th, null);
    drawCurve(ctx, top, dBpts, [wMin, wMax], ydb, th.curve, 1.8);
    drawLabel(ctx, top, (s.label ? s.label + ' ' : '') + '幅频 (dB)', th);

    drawAxis(ctx, bot, [wMin, wMax], yph, th, 'ω');
    drawCurve(ctx, bot, phpts, [wMin, wMax], yph, th.pole, 1.8);
    drawLabel(ctx, bot, '相频 (°)', th);
  }

  // 零极点图
  function drawPoleZero(ctx, W, H, s, th) {
    const domain = s.domain === 'z' ? 'z' : 's';
    const zeros = polyRoots(toCoeffs(s.num));
    const poles = polyRoots(toCoeffs(s.den));
    let R = 1;
    zeros.concat(poles).forEach(function (r) {
      R = Math.max(R, Math.abs(r.re), Math.abs(r.im));
    });
    R = R * 1.25 + 0.25;
    const size = Math.max(80, Math.min(W - 60, H - 80));
    const box = { x: (W - size) / 2, y: 30, w: size, h: size };
    const xr = [-R, R], yr = [-R, R];

    drawAxis(ctx, box, xr, yr, th, null);

    // z 域画单位圆；s 域的虚轴即竖直零轴（已由 drawAxis 画出）
    if (domain === 'z') {
      const cx = mapX(box, 0, xr[0], xr[1]);
      const cy = mapY(box, 0, yr[0], yr[1]);
      const rad = Math.abs(mapX(box, 1, xr[0], xr[1]) - cx);
      ctx.save();
      ctx.strokeStyle = th.muted; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 极点 ×
    ctx.strokeStyle = th.pole; ctx.lineWidth = 2;
    poles.forEach(function (p) {
      const px = mapX(box, p.re, xr[0], xr[1]);
      const py = mapY(box, p.im, yr[0], yr[1]);
      const d = 5;
      ctx.beginPath();
      ctx.moveTo(px - d, py - d); ctx.lineTo(px + d, py + d);
      ctx.moveTo(px - d, py + d); ctx.lineTo(px + d, py - d);
      ctx.stroke();
    });
    // 零点 ○
    ctx.strokeStyle = th.zeroMark; ctx.lineWidth = 2;
    zeros.forEach(function (q) {
      const px = mapX(box, q.re, xr[0], xr[1]);
      const py = mapY(box, q.im, yr[0], yr[1]);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 稳定性结论
    let stable;
    if (domain === 's') stable = poles.every(function (p) { return p.re < 1e-9; });
    else stable = poles.every(function (p) { return Math.hypot(p.re, p.im) < 1 - 1e-9; });
    const msg = stable
      ? (domain === 's' ? '稳定：极点全在左半平面' : '稳定：极点全在单位圆内')
      : (domain === 's' ? '不稳定：存在右半平面极点' : '不稳定：存在单位圆外极点');

    drawLabel(ctx, box, (s.label || (domain === 's' ? '连续系统' : '离散系统')) + '　× 极点　○ 零点', th);
    ctx.fillStyle = stable ? th.stem : th.pole;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(msg, W / 2, H - 8);
  }

  // 尼科尔斯图：横轴 ∠G(°)（连续展开），纵轴 20lg|G|(dB)，标出 (−180°, 0 dB) 临界点与裕度
  function drawNichols(ctx, W, H, s, th) {
    const box = panelBox(W, H, { l: 60, r: 20, t: 28, b: 38 });
    const numC = trimLead(toCoeffs(s.num)), denC = trimLead(toCoeffs(s.den));
    if (!numC.length || denC.length < 2) { notice(ctx, box, '系数错误：请填写开环真分式的分子/分母系数', th); return; }
    const wMin = Math.max(1e-4, num(s.wMin, 0.01));
    const wMax = num(s.wMax, 100);
    const N = Math.max(20, Math.floor(num(s.samples, 600)));

    const ws = [], phs = [], dbs = [];
    for (let i = 0; i < N; i++) {
      const w = wMin + (wMax - wMin) * i / (N - 1);
      const h = freqResp(numC, denC, w, 's');
      const mag = Math.hypot(h.re, h.im);
      ws.push(w);
      phs.push(Math.atan2(h.im, h.re) * 180 / Math.PI);
      dbs.push(isFinite(mag) && mag > 0 ? 20 * Math.log10(mag) : -Infinity);
    }
    const uph = unwrapPhase(phs);
    const pts = [];
    for (let i = 0; i < N; i++) if (isFinite(uph[i]) && isFinite(dbs[i])) pts.push({ x: uph[i], y: dbs[i] });
    if (!pts.length) { notice(ctx, box, '无法计算频率响应', th); return; }

    let xLo = Infinity, xHi = -Infinity, yLo = Infinity, yHi = -Infinity;
    pts.forEach(function (p) {
      xLo = Math.min(xLo, p.x); xHi = Math.max(xHi, p.x);
      yLo = Math.min(yLo, p.y); yHi = Math.max(yHi, p.y);
    });
    xLo = Math.min(xLo, -180); xHi = Math.max(xHi, 0);
    yLo = Math.min(yLo, 0); yHi = Math.max(yHi, 0);
    const xr = niceRange(xLo, xHi), yr = niceRange(yLo, yHi);
    drawAxis(ctx, box, xr, yr, th, '∠G (°)');

    // 关键线：−180°（相位交界）与 0 dB（幅值交界）
    ctx.save();
    ctx.strokeStyle = th.muted; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    const x180 = mapX(box, -180, xr[0], xr[1]);
    if (x180 > box.x && x180 < box.x + box.w) { ctx.beginPath(); ctx.moveTo(x180, box.y); ctx.lineTo(x180, box.y + box.h); ctx.stroke(); }
    const y0 = mapY(box, 0, yr[0], yr[1]);
    if (y0 > box.y && y0 < box.y + box.h) { ctx.beginPath(); ctx.moveTo(box.x, y0); ctx.lineTo(box.x + box.w, y0); ctx.stroke(); }
    ctx.restore();

    drawCurve(ctx, box, pts, xr, yr, th.curve, 1.8);

    // 临界点 (−180°, 0 dB)
    const cx = mapX(box, -180, xr[0], xr[1]), cy = mapY(box, 0, yr[0], yr[1]);
    if (cx > box.x && cx < box.x + box.w && cy > box.y && cy < box.y + box.h) {
      ctx.save();
      ctx.strokeStyle = th.pole; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
      ctx.restore();
    }

    // 相角裕度 γ 与幅值裕度 GM（与「稳定裕度」表同口径）
    let wc = null, wg = null;
    for (let i = 1; i < N; i++) {
      const m0 = dbs[i - 1], m1 = dbs[i];
      if (wc == null && ((m0 <= 0 && m1 >= 0) || (m0 >= 0 && m1 <= 0))) {
        const t = Math.abs(m1 - m0) < 1e-15 ? 0.5 : Math.abs(m0) / (Math.abs(m0) + Math.abs(m1));
        wc = ws[i - 1] + (ws[i] - ws[i - 1]) * t;
      }
      const g0 = uph[i - 1] + 180, g1 = uph[i] + 180;
      if (wg == null && ((g0 <= 0 && g1 >= 0) || (g0 >= 0 && g1 <= 0))) {
        const t = Math.abs(g1 - g0) < 1e-15 ? 0.5 : Math.abs(g0) / (Math.abs(g0) + Math.abs(g1));
        wg = ws[i - 1] + (ws[i] - ws[i - 1]) * t;
      }
    }
    let gamma = null, GM = null;
    if (wc != null) {
      const h = freqResp(numC, denC, wc, 's');
      gamma = 180 + Math.atan2(h.im, h.re) * 180 / Math.PI;
    }
    if (wg != null) {
      const h = freqResp(numC, denC, wg, 's');
      const mag = Math.hypot(h.re, h.im);
      if (mag > 0) GM = -20 * Math.log10(mag);
    }
    const r2 = x => Math.round(x * 100) / 100;

    drawLabel(ctx, box, (s.label || '尼科尔斯图') + '　' + tfText(s.num, s.den), th);
    ctx.fillStyle = th.muted;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('相角裕度 γ = ' + (gamma != null ? r2(gamma) + '°' : '未找到')
      + '　幅值裕度 GM = ' + (GM != null ? r2(GM) + ' dB' : '未找到')
      + '　(−180°, 0 dB) 为临界点', W / 2, H - 8);
  }

  // 状态响应：由 A/B/C/D 积分 ẋ=Ax+Bu，画出各状态 x_i(t) 与输出 y(t)（现控用）
  function normCol(M, n) {
    if (M == null) return null;
    if (!Array.isArray(M)) { const v = Number(M); return isFinite(v) ? new Array(n).fill(0).map(function (_, i) { return i === 0 ? v : 0; }) : null; }
    if (Array.isArray(M[0])) return (M.length === n && M.every(function (r) { return Array.isArray(r) && r.length === 1; })) ? M.map(function (r) { return [Number(r[0])]; }) : null;
    return M.length === n ? M.map(function (v) { return Number(v); }) : null;
  }
  function normRow(M, n) {
    if (M == null) return null;
    if (!Array.isArray(M)) { const v = Number(M); return isFinite(v) ? new Array(n).fill(0).map(function (_, i) { return i === 0 ? v : 0; }) : null; }
    if (Array.isArray(M[0])) return (M.length === 1 && M[0].length === n) ? M[0].map(Number) : null;
    return M.length === n ? M.map(Number) : null;
  }
  function drawStateResp(ctx, W, H, s, th) {
    const box = panelBox(W, H, { l: 64, r: 20, t: 28, b: 38 });
    const A = s.A;
    if (!Array.isArray(A) || !A.length || (A[0] || []).length !== A.length) {
      notice(ctx, box, '状态矩阵 A 必须是方阵，如 “0, 1; -2, -3”', th); return;
    }
    const n = A.length;
    const B = normCol(s.B, n);
    const C = normRow(s.C, n);
    if (!B || !C) { notice(ctx, box, 'B（n×1 列）与 C（1×n 行）要和 A 同阶', th); return; }
    const D = (s.D == null) ? 0 : (Array.isArray(s.D) ? Number((Array.isArray(s.D[0]) ? s.D[0][0] : s.D[0]) || 0) : Number(s.D));
    const tMax = num(s.tMax, 10);
    const N = Math.max(20, Math.floor(num(s.samples, 800)));
    const mode = (s.u === 'impulse' || s.u === 'zero') ? s.u : 'step';

    const x0 = new Array(n).fill(0);
    if (mode === 'impulse') { for (let i = 0; i < n; i++) x0[i] = B[i][0]; }
    else if (mode === 'zero') {
      const z = Array.isArray(s.x0) ? s.x0 : [];
      for (let i = 0; i < n; i++) x0[i] = isFinite(Number(z[i])) ? Number(z[i]) : 0;
    }
    const sys = { A: A.map(function (r) { return r.map(Number); }), B: B.map(function (r) { return Number(r[0]); }), C: C.map(Number), D: D, n: n };
    const sim = integrateRK4(sys, x0, tMax, N, mode === 'step' ? 1 : null);

    const curves = [];
    for (let j = 0; j < n; j++) curves.push({ name: 'x' + (j + 1), pts: sim.xs.map(function (x, i) { return { x: i * sim.dt, y: isFinite(x[j]) ? x[j] : NaN }; }) });
    curves.push({ name: 'y', pts: sim.xs.map(function (x, i) {
      let y = 0; for (let j = 0; j < n; j++) y += C[j] * x[j];
      if (mode === 'step') y += D;
      return { x: i * sim.dt, y: isFinite(y) ? y : NaN };
    }) });

    let lo = Infinity, hi = -Infinity;
    curves.forEach(function (c) { c.pts.forEach(function (p) { if (isFinite(p.y)) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); } }); });
    if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
    lo = Math.min(lo, 0); hi = Math.max(hi, 0);
    const yr = niceRange(lo, hi);
    const xr = [0, tMax];
    drawAxis(ctx, box, xr, yr, th, 't');

    const cols = palette(curves.length);
    curves.forEach(function (c, k) { drawCurve(ctx, box, c.pts, xr, yr, cols[k], c.name === 'y' ? 2.2 : 1.5); });

    // 图例（右上角，右对齐）
    ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const gap = 12;
    let total = 0;
    curves.forEach(function (c) { total += 12 + gap + ctx.measureText(c.name).width + gap; });
    let lx = box.x + box.w - total + gap;
    const lyc = box.y + 13;
    curves.forEach(function (c, k) {
      ctx.fillStyle = cols[k]; ctx.fillRect(lx, lyc - 1, 12, 3);
      ctx.fillStyle = th.text; ctx.fillText(c.name, lx + 12 + 4, lyc);
      lx += 12 + 4 + ctx.measureText(c.name).width + gap;
    });

    const modeText = mode === 'step' ? '单位阶跃 u=1' : (mode === 'impulse' ? '单位冲激（x₀=B）' : '零输入');
    drawLabel(ctx, box, (s.label || '状态响应') + '　A=' + matText(A) + '　' + modeText, th);
  }

  // 相平面 / 相轨迹：2 阶自治系统 ẋ=Ax 在相平面 (x₁, x₂) 上的轨迹族
  function drawPhasePortrait(ctx, W, H, s, th) {
    const box = panelBox(W, H, { l: 56, r: 20, t: 28, b: 38 });
    let A = null;
    if (Array.isArray(s.A) && s.A.length === 2 && Array.isArray(s.A[0]) && s.A[0].length === 2) {
      A = s.A.map(function (r) { return r.map(Number); });
    } else {
      let sys;
      try { sys = ssFromTF(s.num, s.den); } catch (e) { notice(ctx, box, '系数错误：' + e.message, th); return; }
      if (sys.n !== 2) { notice(ctx, box, '相平面图需要二阶系统（分母写三个系数，如 [1, 3, 2]）', th); return; }
      A = sys.A;
    }
    const tMax = num(s.tMax, 12);
    const N = Math.max(20, Math.floor(num(s.samples, 400)));
    const z0 = Array.isArray(s.x0) ? s.x0.map(Number) : [];
    const user = [isFinite(z0[0]) ? z0[0] : 1, isFinite(z0[1]) ? z0[1] : 0];
    const baseR = Math.max(0.5, Math.hypot(user[0], user[1]));

    const sys2 = { A: A, B: [0, 0], C: [1, 0], D: 0, n: 2 };
    const trajs = [];
    [0.5, 1].forEach(function (k) {
      for (let a = 0; a < 12; a++) {
        const ang = a * Math.PI / 6;
        trajs.push(integrateRK4(sys2, [k * baseR * Math.cos(ang), k * baseR * Math.sin(ang)], tMax, N, null).xs);
      }
    });
    const userTraj = integrateRK4(sys2, user, tMax, N, null).xs;

    let R = baseR;
    trajs.concat([userTraj]).forEach(function (tr) {
      tr.forEach(function (p) { R = Math.max(R, Math.abs(p[0]), Math.abs(p[1])); });
    });
    R = Math.min(R, baseR * 12) * 1.1 + 0.3;
    const xr = [-R, R], yr = [-R, R];
    drawAxis(ctx, box, xr, yr, th, 'x₁');

    trajs.forEach(function (tr) { drawCurve(ctx, box, tr.map(function (p) { return { x: p[0], y: p[1] }; }), xr, yr, th.grid, 1.1); });
    drawCurve(ctx, box, userTraj.map(function (p) { return { x: p[0], y: p[1] }; }), xr, yr, th.curve, 2);

    ctx.save();
    // 起点标记
    const px = mapX(box, user[0], xr[0], xr[1]), py = mapY(box, user[1], yr[0], yr[1]);
    ctx.fillStyle = th.pole;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    // 平衡点（原点）
    const ox = mapX(box, 0, xr[0], xr[1]), oy = mapY(box, 0, yr[0], yr[1]);
    ctx.strokeStyle = th.zero; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ox - 5, oy); ctx.lineTo(ox + 5, oy);
    ctx.moveTo(ox, oy - 5); ctx.lineTo(ox, oy + 5);
    ctx.stroke();
    ctx.restore();

    // 2×2 特征值 → 平衡点类型（复用纯函数 classifyEquilibrium2）
    const eq = classifyEquilibrium2(A);
    const tr = eq.tr, det = eq.det, type = eq.type;
    drawLabel(ctx, box, (s.label || '相平面 / 相轨迹') + '　· 标记为给定初值，原点为平衡点', th);
    ctx.fillStyle = th.muted;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('tr A = ' + fmtTick(tr) + '　det A = ' + fmtTick(det) + '　→ ' + type, W / 2, H - 8);
  }

  // 分派绘制入口；无可用 canvas 时返回 null
  function drawPlot(canvas, spec) {
    const ctx = getCtx(canvas);
    if (!ctx) return null;
    const s = spec && typeof spec === 'object' ? spec : {};
    const W = Math.floor(num(canvas.width, 0));
    const H = Math.floor(num(canvas.height, 0));
    if (!(W > 0) || !(H > 0)) return null;
    const th = theme(!!s.dark, s.color);
    try {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, W, H);
      if (s.kind === 'step') drawStep(ctx, W, H, s, th);
      else if (s.kind === 'bode') drawBode(ctx, W, H, s, th);
      else if (s.kind === 'nyquist') drawNyquist(ctx, W, H, s, th);
      else if (s.kind === 'rootlocus') drawRootLocus(ctx, W, H, s, th);
      else if (s.kind === 'polezero') drawPoleZero(ctx, W, H, s, th);
      else if (s.kind === 'nichols') drawNichols(ctx, W, H, s, th);
      else if (s.kind === 'state') drawStateResp(ctx, W, H, s, th);
      else if (s.kind === 'phase') drawPhasePortrait(ctx, W, H, s, th);
      else {
        const box = panelBox(W, H, { l: 16, r: 16, t: 16, b: 16 });
        notice(ctx, box, '未知图型：' + (s.kind || '(空)'), th);
      }
    } catch (e) {
      ctx.fillStyle = th.pole;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('绘图失败：' + (e && e.message ? e.message : '未知错误'), W / 2, H / 2);
    }
    return true;
  }

  /* =========================================================
     五、一键载入示例（每种 kind ≥ 2 个，参数完整）
     ========================================================= */
  const PREVIEW = {
    step: [
      { kind: 'step', resp: 'step', num: [10], den: [1, 2, 10], tMax: 6, samples: 800, label: '单位阶跃响应 G(s)=10/(s²+2s+10)' },
      { kind: 'step', resp: 'step', num: [1], den: [1, 3, 2], tMax: 8, samples: 800, label: '二阶过阻尼 G(s)=1/(s²+3s+2)' },
      { kind: 'step', resp: 'impulse', num: [1], den: [1, 1, 1], tMax: 10, samples: 800, label: '临界阻尼单位冲激响应 G(s)=1/(s²+s+1)' },
    ],
    bode: [
      { kind: 'bode', num: [1], den: [1, 1], domain: 's', wMin: 0.01, wMax: 100, samples: 400, label: '一阶系统 G(s)=1/(s+1)' },
      { kind: 'bode', num: [10], den: [1, 2, 10], domain: 's', wMin: 0.01, wMax: 100, samples: 400, label: '二阶振荡 G(s)=10/(s²+2s+10)' },
    ],
    nyquist: [
      { kind: 'nyquist', num: [10], den: [1, 2, 10], wMin: 0.01, wMax: 100, samples: 600, label: 'G(s)=10/(s²+2s+10)' },
      { kind: 'nyquist', num: [1], den: [1, 3, 2, 0], wMin: 0.01, wMax: 100, samples: 600, label: 'G(s)=1/(s(s+1)(s+2))' },
    ],
    rootlocus: [
      { kind: 'rootlocus', num: [1], den: [1, 3, 2, 0], kMax: 50, samples: 220, label: 'G(s)=1/(s(s+1)(s+2))' },
      { kind: 'rootlocus', num: [1, 2], den: [1, 2, 2, 0], kMax: 30, samples: 220, label: 'G(s)=(s+2)/(s(s²+2s+2))' },
    ],
    polezero: [
      { kind: 'polezero', num: [1, 2], den: [1, 3, 2], domain: 's', label: 'G(s)=(s+2)/(s²+3s+2)' },
      { kind: 'polezero', num: [10], den: [1, 2, 10], domain: 's', label: 'G(s)=10/(s²+2s+10) 复极点' },
    ],
    nichols: [
      { kind: 'nichols', num: [10], den: [1, 2, 10], wMin: 0.01, wMax: 100, samples: 600, label: '尼科尔斯图 G(s)=10/(s²+2s+10)' },
      { kind: 'nichols', num: [1], den: [1, 3, 2, 0], wMin: 0.01, wMax: 100, samples: 600, label: '尼科尔斯图 G(s)=1/(s(s+1)(s+2))' },
    ],
    state: [
      { kind: 'state', A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]], u: 'step', tMax: 8, samples: 800, label: '状态响应 ẋ=Ax+Bu' },
      { kind: 'state', A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]], u: 'impulse', tMax: 8, samples: 800, label: '状态冲激响应（x₀=B）' },
    ],
    phase: [
      { kind: 'phase', num: [1], den: [1, 3, 2], x0: [1, 0], tMax: 12, samples: 400, label: '稳定结点（过阻尼）' },
      { kind: 'phase', num: [1], den: [1, 0, 4], x0: [1, 0], tMax: 12, samples: 400, label: '中心（无阻尼，等幅振荡）' },
    ],
  };

  return {
    compileExpr: compileExpr,
    tryCompileExpr: tryCompileExpr,
    evalPoly: evalPoly,
    polyMul: polyMul,
    polyAdd: polyAdd,
    polyRoots: polyRoots,
    freqResp: freqResp,
    ssFromTF: ssFromTF,
    integrateRK4: integrateRK4,
    nyquistCount: nyquistCount,
    classifyEquilibrium2: classifyEquilibrium2,
    drawPlot: drawPlot,
    PREVIEW: PREVIEW,
  };
});

