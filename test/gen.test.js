/* =========================================================
   gen.js 单元测试（Node 内置 test runner，node:test + node:assert）
   运行：node test/gen.test.js   （cwd = 项目根目录）

   gen.js 是「按标签一键生成图表」的纯逻辑模块：规则层 → 抽取层 → 表格层，
   全部与 DOM 无关、不联网、不使用任何 API Key。本文件只验证纯逻辑部分。
   ========================================================= */
const test = require('node:test');
const assert = require('node:assert/strict');
const MQG = require('../gen.js');

const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
const rowOf = (t, key) => t.rows.find(r => String(r[0]).indexOf(key) >= 0);
const ZH = /[\u4e00-\u9fa5]/;

/* ===================== 规则层：标签 → 生成项 ===================== */
test('规则层：ac 标签匹配到正确的图/表，未知标签与科目返回 null', () => {
  const r = MQG.tagRule('ac', '二阶系统');
  assert.ok(r, '「二阶系统」应有规则');
  assert.deepEqual(r.plots, ['step']);
  assert.deepEqual(r.tables, ['perf', 'poles']);
  assert.ok(Array.isArray(r.need), 'rule 必须含 need 数组');
  assert.deepEqual(MQG.tagRule('ac', '劳斯判据').tables, ['routh']);
  assert.deepEqual(MQG.tagRule('ac', 'Bode 图').plots, ['bode']);
  assert.equal(MQG.tagRule('ac', '这个标签不存在'), null);
  assert.equal(MQG.tagRule('不存在的科目', '二阶系统'), null);
});

test('规则层：lc 标签（状态方程/能控性秩判据/多变量系统/离散化）', () => {
  assert.deepEqual(MQG.tagRule('lc', '状态方程').tables, ['ssmat', 'sschar']);
  assert.deepEqual(MQG.tagRule('lc', '能控性秩判据').tables, ['ctrbo']);
  assert.deepEqual(MQG.tagRule('lc', '多变量系统').tables, ['ssmat', 'sschar', 'ctrbo']);
  assert.deepEqual(MQG.tagRule('lc', '渐近稳定').plots, ['polezero']);
  assert.deepEqual(MQG.tagRule('lc', '离散化').tables, ['ssmat']);
});

test('规则层：标签匹配忽略所有空白（Bode 图 == Bode图，PBH 判据 == PBH判据）', () => {
  assert.ok(MQG.tagRule('ac', ' Bode图 '), '应忽略首尾空白与词间空格');
  assert.ok(MQG.tagRule('ac', 'Bode图'));
  assert.ok(MQG.tagRule('lc', 'PBH判据'));
  assert.ok(MQG.tagRule('lc', 'PBH  判据'));
  assert.deepEqual(MQG.tagRule('ac', ' Bode 图 ').plots, ['bode']);
});

test('规则层：可驱动标签列表只含能生成图/表的标签', () => {
  const ac = MQG.drivableTags('ac');
  ['二阶系统', '根轨迹', 'Bode 图', '奈奎斯特', '型别'].forEach(t => assert.ok(ac.includes(t), t));
  const lc = MQG.drivableTags('lc');
  ['状态方程', '能控性秩判据', '多变量系统', '离散化', '观测器'].forEach(t => assert.ok(lc.includes(t), t));
  assert.deepEqual(MQG.drivableTags('缺科目'), []);
});

/* ===================== 抽取层：传递函数 ===================== */
test('extractTF：\\frac 形式 → 降幂系数', () => {
  const tf = MQG.extractTF('$G(s)=\\frac{10}{s^{2}+2s+10}$');
  assert.ok(tf);
  assert.equal(tf.domain, 's');
  assert.deepEqual(tf.num, [10]);
  assert.deepEqual(tf.den, [1, 2, 10]);
  assert.ok(tf.raw, '应保留原始 LaTeX');
});

test('extractTF：\\dfrac 形式 + 隐式乘法 2s → 2*s', () => {
  const tf = MQG.extractTF('$G(s)=\\dfrac{2s+1}{s^{2}+3s+2}$');
  assert.ok(tf);
  assert.deepEqual(tf.num, [2, 1]);
  assert.deepEqual(tf.den, [1, 3, 2]);
});

test('rationalCoeffs：负幂（z^{-1}）归一化为正幂系数', () => {
  const rc = MQG.rationalCoeffs('\\dfrac{1}{1-0.9z^{-1}}', 'z');
  assert.deepEqual(rc.num, [1, 0]);     // z
  assert.deepEqual(rc.den, [1, -0.9]);  // z − 0.9
});

test('extractTFList：多个传递函数按出现顺序返回', () => {
  const list = MQG.extractTFList('闭 $G(s)=\\frac{1}{s+1}$；开环 $G_k(s)=\\frac{5}{s(s+2)}$');
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].den, [1, 1]);
  assert.deepEqual(list[1].den, [1, 2, 0]);
});

test('extractOpenLoop：只认明写「开环」的传递函数', () => {
  const tf = MQG.extractOpenLoop('系统开环传递函数 $G(s)=\\frac{1}{s(s+1)(s+2)}$');
  assert.ok(tf);
  assert.deepEqual(tf.den, [1, 3, 2, 0]);
  assert.equal(MQG.extractOpenLoop('$G(s)=\\frac{1}{s+1}$'), null, '没有「开环」字样时不返回');
});

/* ===================== 抽取层：微分方程 ===================== */
test('extractDiffEq：撇号形式 y\'\'+3y\'+2y=u → a=[1,3,2], b=[1]', () => {
  const eq = MQG.extractDiffEq("$y''(t)+3y'(t)+2y(t)=u(t)$");
  assert.ok(eq);
  assert.equal(eq.order, 2);
  assert.deepEqual(eq.a, [1, 3, 2]);
  assert.deepEqual(eq.b, [1]);
  assert.ok(ZH.test(eq.label) || eq.label.indexOf('=') >= 0);
});

test('extractDiffEq：\\frac{d^{2}y}{dt^{2}} 形式也能识别', () => {
  const eq = MQG.extractDiffEq('$\\frac{d^{2}y}{dt^{2}}+2\\frac{dy}{dt}+10y=10u(t)$');
  assert.ok(eq);
  assert.equal(eq.order, 2);
  assert.deepEqual(eq.a, [1, 2, 10]);
  assert.deepEqual(eq.b, [10]);
});

/* ===================== 抽取层：状态空间 ===================== */
test('matrixFromTex：pmatrix / bmatrix 解析为数值矩阵', () => {
  assert.deepEqual(MQG.matrixFromTex('\\begin{pmatrix}0&1\\\\-2&-3\\end{pmatrix}'), [[0, 1], [-2, -3]]);
  assert.deepEqual(MQG.matrixFromTex('\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}'), [[1, 0], [0, 1]]);
  assert.equal(MQG.matrixFromTex('没有矩阵'), null);
});

test('extractStateSpace：A/B/C/D 一次性抽取，D 允许标量', () => {
  const ss = MQG.extractStateSpace(
    '$A=\\begin{pmatrix}0&1\\\\-2&-3\\end{pmatrix},\\ B=\\begin{pmatrix}0\\\\1\\end{pmatrix},\\ C=\\begin{pmatrix}1&0\\end{pmatrix},\\ D=0$');
  assert.ok(ss);
  assert.equal(ss.n, 2);
  assert.deepEqual(ss.A, [[0, 1], [-2, -3]]);
  assert.deepEqual(ss.B, [[0], [1]]);
  assert.deepEqual(ss.C, [[1, 0]]);
  assert.deepEqual(ss.D, [[0]]);
});

/* ===================== 抽取层：整包 params 与增益 ===================== */
test('extractParams：参数键名与取值符合契约', () => {
  const p = MQG.extractParams('题面 $G(s)=\\frac{10}{s^{2}+2s+10}$，K=5');
  assert.deepEqual(Object.keys(p).sort(),
    ['eq', 'gainK', 'notes', 'openLoop', 'ss', 'tf'].sort());
  assert.deepEqual(p.tf.den, [1, 2, 10]);
  assert.equal(p.gainK, 5);
  assert.ok(Array.isArray(p.notes));
});

/* ===================== 表格层：极点与稳定性 ===================== */
test('表格层 poles：10/(s²+2s+10) 为复极点，结论稳定', () => {
  const t = MQG.buildTable('poles', { tf: { num: [10], den: [1, 2, 10], domain: 's', raw: 'G(s)' } });
  assert.ok(t);
  const poleRows = t.rows.filter(r => String(r[0]).startsWith('极点'));
  assert.equal(poleRows.length, 2);
  // 手算：s²+2s+10 的根为 −1±3j（复极点）
  assert.ok(poleRows.some(r => /j/.test(r[1])), '应为复极点');
  assert.ok(poleRows.every(r => r[3] === '稳定'), JSON.stringify(t.rows));
  assert.match(rowOf(t, '结论')[1], /稳定/);
});

/* ===================== 表格层：二阶性能指标 ===================== */
test('表格层 perf：den=[1,2,10] → ζ≈0.3162, ωn≈3.1623, σ%≈35.09', () => {
  const t = MQG.buildTable('perf', { tf: { num: [10], den: [1, 2, 10], domain: 's' } });
  assert.ok(t);
  const zeta = Number(rowOf(t, 'ζ')[1]);
  const wn = Number(rowOf(t, 'ωn')[1]);
  const sigma = Number(rowOf(t, 'σ%')[1]);
  // 手算：ωn=√10≈3.16228；ζ=2/(2ωn)=1/√10≈0.31623；
  //       σ%=100·e^(−πζ/√(1−ζ²))=100·e^(−1.0472)≈35.09（注：非 38.1）
  assert.ok(near(zeta, 0.31623, 1e-3), 'ζ=' + zeta);
  assert.ok(near(wn, 3.16228, 1e-3), 'ωn=' + wn);
  assert.ok(near(sigma, 35.09, 0.5), 'σ%=' + sigma);
  assert.ok(near(Number(rowOf(t, 'ts')[1]), 4, 0.01), 'ts=4/(ζωn)=4');
});

test('表格层 perf：ζ≥1（过阻尼）时 σ%/tp 优雅降级为「—」', () => {
  const t = MQG.buildTable('perf', { tf: { num: [1], den: [1, 3, 2], domain: 's' } });
  assert.ok(t);
  // 手算：ωn=√2, ζ=3/(2√2)=1.0607 > 1
  assert.ok(near(Number(rowOf(t, 'ζ')[1]), 1.0607, 1e-3));
  assert.equal(rowOf(t, 'σ%')[1], '—');
  assert.equal(rowOf(t, 'tp')[1], '—');
  assert.match(t.note, /不适用|过阻尼|临界/);
});

test('表格层 perf：非二阶分母（一阶/三阶）返回 null', () => {
  assert.equal(MQG.buildTable('perf', { tf: { num: [1], den: [1, 1], domain: 's' } }), null);
  assert.equal(MQG.buildTable('perf', { tf: { num: [1], den: [1, 1, 1, 1], domain: 's' } }), null);
});

/* ===================== 表格层：劳斯表 ===================== */
test('表格层 routh：den=[1,3,2] → 0 次变号（无右半平面极点）', () => {
  const t = MQG.buildTable('routh', { tf: { num: [1], den: [1, 3, 2], domain: 's' } });
  assert.ok(t);
  // 手算：s²+3s+2=(s+1)(s+2)，根全在左半平面 → 首列 [1,3,2] 全正 → 0 次变号
  assert.match(t.note, /变号 0 次/);
  assert.match(rowOf(t, '结论')[1], /变号 0 次/);
});

test('表格层 routh：den=[1,-3,2] → 2 次变号 → 2 个右半平面极点', () => {
  const t = MQG.buildTable('routh', { tf: { num: [1], den: [1, -3, 2], domain: 's' } });
  assert.ok(t);
  // 手算：s²−3s+2=(s−1)(s−2)，两根均为正（右半平面）→ 首列 [1,-3,2] 变号 2 次
  assert.match(rowOf(t, '结论')[1], /变号 2 次/);
});

test('表格层 routh：den=[1,2,3,4] → 0 次变号（其实稳定）', () => {
  const t = MQG.buildTable('routh', { tf: { num: [1], den: [1, 2, 3, 4], domain: 's' } });
  assert.ok(t);
  // 手算：首列 [1,2,1,4] 全正 → 0 次变号
  assert.match(rowOf(t, '结论')[1], /变号 0 次/);
});

test('表格层 routh：首列出现 0 时标注「需特殊处理」，不臆造走向', () => {
  const t = MQG.buildTable('routh', { tf: { num: [1], den: [1, 0, 1], domain: 's' } });
  assert.ok(t);
  assert.match(t.note, /特殊处理|ε/);
  assert.match(t.note, /不臆造|不编造|未给出/);
});

/* ===================== 表格层：稳定裕度 ===================== */
test('表格层 margins：开环 1/(s(s+1)(s+2)) → γ≈53.4°, GM≈15.56 dB，结论稳定', () => {
  const t = MQG.buildTable('margins', { openLoop: { num: [1], den: [1, 3, 2, 0], domain: 's' } });
  assert.ok(t);
  // 手算（独立推导）：
  //  |G(jω)|=1/(ω√(ω²+1)√(ω²+4))，解 ω⁶+5ω⁴+4ω²=1 → ωc≈0.4459 rad/s；
  //  ∠G=−90°−atanω−atan(ω/2)，在 ωc 处 ≈−126.6° → γ=180−126.6≈53.4°。
  //  ∠G=−180° ⇔ atanω+atan(ω/2)=90° ⇔ ω=√2≈1.4142；|G|=1/6 → GM=20log₁₀6≈15.56 dB。
  const gamma = Number(String(rowOf(t, '相角裕度')[1]).replace(/[^\d.eE+-]/g, ''));
  const gm = Number(String(rowOf(t, '幅值裕度')[1]).replace(/[^\d.eE+-]/g, ''));
  assert.ok(near(gamma, 53.4, 0.5), 'γ=' + gamma);
  assert.ok(near(gm, 15.56, 0.1), 'GM=' + gm);
  assert.match(rowOf(t, '是否稳定')[1], /稳定/);
});

test('表格层 margins：无交界点时如实标注「未找到」，不编造', () => {
  // 开环 G=1/(s+1)：|G| 恒<1 且相位恒 >−180 → 两个交界点都找不到
  const t = MQG.buildTable('margins', { openLoop: { num: [1], den: [1, 1], domain: 's' } });
  assert.ok(t);
  assert.match(String(rowOf(t, '幅值交界')[1]), /未找到/);
});

/* ===================== 表格层：型别与稳态误差 ===================== */
test('表格层 steady：v=1 的开环 5/(s(s+1)) → 阶跃误差 0，斜坡误差 1/5', () => {
  const t = MQG.buildTable('steady', { openLoop: { num: [5], den: [1, 1, 0], domain: 's' } });
  assert.ok(t);
  assert.equal(rowOf(t, '型别')[1], '1');
  assert.equal(rowOf(t, '开环增益')[1], '5');
  assert.equal(rowOf(t, '阶跃')[1], '0');
  assert.equal(rowOf(t, '斜坡')[1], '0.2');
  assert.equal(rowOf(t, '加速度')[1], '∞');
});

test('表格层 steady：v=0 的开环 10/(s²+2s+10) → 阶跃 1/(1+K)，斜坡 ∞', () => {
  const t = MQG.buildTable('steady', { openLoop: { num: [10], den: [1, 2, 10], domain: 's' } });
  assert.ok(t);
  assert.equal(rowOf(t, '型别')[1], '0');
  assert.equal(rowOf(t, '开环增益')[1], '1');   // 10/10
  assert.equal(rowOf(t, '阶跃')[1], '0.5');      // 1/(1+1)
  assert.equal(rowOf(t, '斜坡')[1], '∞');
});

/* ===================== 表格层：频率响应关键点 / 系数 ===================== */
test('表格层 freqs：对数取 6 点，返回 dB 与相角', () => {
  const t = MQG.buildTable('freqs', { tf: { num: [10], den: [1, 2, 10], domain: 's' } });
  assert.ok(t);
  assert.equal(t.rows.length, 6);
  assert.deepEqual(t.head, ['ω (rad/s)', '|G| (dB)', '∠G (°)']);
});

test('表格层 coeffs：微分方程来源也能给出系数与特征根', () => {
  const eq = MQG.extractDiffEq("$y''(t)+3y'(t)+2y(t)=u(t)$");
  const t = MQG.buildTable('coeffs', { eq: eq });
  assert.ok(t);
  assert.equal(rowOf(t, '分母系数')[1], '[1, 3, 2]');
  assert.equal(rowOf(t, '分子系数')[1], '[1]');
  assert.ok(t.rows.some(r => String(r[0]).startsWith('特征根') && /稳定/.test(r[1])));
});

/* ===================== 表格层：状态空间三联 ===================== */
const SS = {
  A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]], n: 2,
};

test('表格层 ssmat：输出 LaTeX pmatrix，tex=true', () => {
  const t = MQG.buildTable('ssmat', { ss: SS });
  assert.ok(t);
  assert.equal(t.tex, true);
  assert.match(rowOf(t, 'A')[1], /^\\begin\{pmatrix\}/);
  assert.match(rowOf(t, 'A')[1], /0 & 1/);
  assert.equal(rowOf(t, 'n')[1], '2');
});

test('表格层 sschar：A 的特征值为 −1、−2 → 渐近稳定', () => {
  const t = MQG.buildTable('sschar', { ss: SS });
  assert.ok(t);
  // 手算：charPoly(A)=s²+3s+2 → 特征值 −1、−2，实部均<0
  const vals = t.rows.filter(r => String(r[0]).startsWith('λ')).map(r => Number(r[1]));
  assert.equal(vals.length, 2);
  assert.ok(vals.some(v => near(v, -1, 1e-6)) && vals.some(v => near(v, -2, 1e-6)), JSON.stringify(vals));
  assert.match(rowOf(t, '结论')[1], /渐近稳定/);
});

test('表格层 ctrbo：[B AB] 与 [C;CA] 均满秩 → 能控且能观', () => {
  const t = MQG.buildTable('ctrbo', { ss: SS });
  assert.ok(t);
  // 手算：Qc=[[0,1],[1,-3]] rank2；Qo=[[1,0],[0,1]] rank2
  assert.match(rowOf(t, '能控性判定')[1], /能控/);
  assert.match(rowOf(t, '能观性判定')[1], /能观/);
  assert.equal(rowOf(t, 'rank Qc')[1], '2 / 2');
});

/* ===================== 矩阵工具 ===================== */
test('matrixRank：容差高斯消元的秩', () => {
  assert.equal(MQG.matrixRank([[1, 2], [2, 4]]), 1);
  assert.equal(MQG.matrixRank([[1, 2], [3, 4]]), 2);
  assert.equal(MQG.matrixRank([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), 2);
  assert.equal(MQG.matrixRank([[0, 0], [0, 0]]), 0);
  assert.equal(MQG.matrixRank([]), 0);
});

test('charPoly：Faddeev–LeVerrier 给出降幂特征多项式', () => {
  assert.deepEqual(MQG.charPoly([[0, 1], [-2, -3]]).map(v => Math.round(v * 1e9) / 1e9), [1, 3, 2]);
  // 手算：tr=5, det=−2 → s²−5s−2
  const c2 = MQG.charPoly([[1, 2], [3, 4]]).map(v => Math.round(v * 1e9) / 1e9);
  assert.deepEqual(c2, [1, -5, -2]);
  // 3×3：伴随型 → s³+6s²+11s+6，根为 −1、−2、−3
  const c3 = MQG.charPoly([[0, 1, 0], [0, 0, 1], [-6, -11, -6]]).map(v => Math.round(v * 1e9) / 1e9);
  assert.deepEqual(c3, [1, 6, 11, 6]);
});

test('eigenValues：2×2 / 3×3 特征值与手算一致', () => {
  const e2 = MQG.eigenValues([[0, 1], [-2, -3]]).map(r => Math.round(r.re * 1e6) / 1e6).sort((a, b) => a - b);
  assert.deepEqual(e2, [-2, -1]);
  const e3 = MQG.eigenValues([[0, 1, 0], [0, 0, 1], [-6, -11, -6]]).map(r => Math.round(r.re * 1e6) / 1e6).sort((a, b) => a - b);
  assert.deepEqual(e3, [-3, -2, -1]);
});

test('ctrbRank / obsvRank：能控能观秩判据', () => {
  const A = [[0, 1], [-2, -3]];
  assert.equal(MQG.ctrbRank(A, [[0], [1]]), 2);            // [B AB] 满秩
  assert.equal(MQG.obsvRank(A, [[1, 0]]), 2);              // [C;CA] 满秩
  assert.equal(MQG.ctrbRank([[1, 0], [0, 1]], [[1], [1]]), 1);  // [B AB]=[[1,1],[1,1]] → 秩 1
  assert.equal(MQG.obsvRank([[1, 0], [0, 1]], [[1, 1]]), 1);
});

/* ===================== 入口：plan ===================== */
test('plan：ac 二阶系统 + 超调量 → step 图（num/den 正确）+ perf/poles 表就绪', () => {
  const p = MQG.plan('ac', {
    tags: ['二阶系统', '超调量'],
    stem: '$G(s)=\\frac{10}{s^{2}+2s+10}$',
  });
  assert.deepEqual(p.tags, ['二阶系统', '超调量']);
  assert.ok(p.hits.length === 2);
  assert.ok(p.params.tf && p.params.tf.domain === 's');
  const step = p.items.find(x => x.type === 'plot' && x.kind === 'step');
  assert.ok(step && step.ready, 'step 图应就绪');
  assert.equal(step.fields.resp, 'step');
  assert.equal(step.fields.num, '[10]');
  assert.equal(step.fields.den, '[1, 2, 10]');
  assert.deepEqual(step.from, ['二阶系统', '超调量']);
  const perf = p.items.find(x => x.type === 'table' && x.kind === 'perf');
  assert.ok(perf && perf.ready && perf.data);
  const poles = p.items.find(x => x.type === 'table' && x.kind === 'poles');
  assert.ok(poles && poles.ready && poles.data);
});

test('plan：无可用参数时 ready=false、missing 非空、hint 为中文，不硬造数据', () => {
  const p = MQG.plan('ac', { tags: ['二阶系统'], stem: '某二阶系统，题目省略。' });
  assert.equal(p.items.length, 3);
  p.items.forEach(it => {
    assert.equal(it.ready, false, it.kind);
    assert.ok(it.missing.length > 0, it.kind + ' 应有缺失项');
    assert.ok(it.hint && it.hint.length > 0, it.kind + ' 应有中文提示');
    assert.ok(ZH.test(it.hint), '提示应为中文：' + it.hint);
    if (it.type === 'plot') assert.equal(it.fields, null);
    if (it.type === 'table') assert.equal(it.data, null);
  });
  const step = p.items.find(x => x.kind === 'step');
  assert.ok(step.missing.includes('tf'));
});

test('plan：lc 状态空间题（渐近稳定）→ polezero 图 + sschar/poles 表就绪', () => {
  const p = MQG.plan('lc', {
    tags: ['渐近稳定'],
    stem: '$A=\\begin{pmatrix}0&1\\\\-2&-3\\end{pmatrix},\\ B=\\begin{pmatrix}0\\\\1\\end{pmatrix},\\ C=\\begin{pmatrix}1&0\\end{pmatrix},\\ D=0$',
  });
  assert.ok(p.params.ss, '应抽出状态空间');
  const pz = p.items.find(x => x.type === 'plot' && x.kind === 'polezero');
  assert.ok(pz && pz.ready, 'polezero 应就绪');
  assert.equal(pz.fields.den, '[1, 3, 2]');   // charPoly(A)
  const sschar = p.items.find(x => x.type === 'table' && x.kind === 'sschar');
  assert.ok(sschar && sschar.ready);
  const poles = p.items.find(x => x.type === 'table' && x.kind === 'poles');
  assert.ok(poles && poles.ready);
  assert.match(rowOf(poles.data, '结论')[1], /稳定/);
});

test('plan：未标标签时 hits 为空、items 为空，但仍返回抽取到的 params', () => {
  const p = MQG.plan('ac', { tags: [], stem: '$G(s)=\\frac{1}{s+1}$' });
  assert.deepEqual(p.hits, []);
  assert.deepEqual(p.items, []);
  assert.deepEqual(p.params.tf.den, [1, 1]);
});
