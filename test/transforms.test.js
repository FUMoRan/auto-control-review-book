/* =========================================================
   transforms.js 数据模块单元测试（Node 内置 test runner）
   运行：node --test test/transforms.test.js  或  node test/transforms.test.js
   站点：自控 · 线控 复习本（《自动控制原理》/《线性控制系统》）
   ========================================================= */
const test = require('node:test');
const assert = require('node:assert/strict');
const MQT = require('../transforms.js');

const {
  PAIRS, PROPS, CONTRAST, TAGS, GROUP_LABEL, PROP_LABEL, searchTransforms,
} = MQT;

/* 各 group 的条目数下限（写死期望，防止数据被删改） */
const GROUP_MIN = { lap: 14, ssb: 10 };
const PROP_MIN = 14;
const CONTRAST_MIN = 9;

/* 收集一组 LaTeX 字符串及其来源标签 */
function allLatex() {
  const out = [];
  PAIRS.forEach(p => {
    out.push(['pair:' + p.id + ':time', p.time]);
    out.push(['pair:' + p.id + ':transform', p.transform]);
  });
  PROPS.forEach(p => {
    ['time', 'freq', 'ss'].forEach(k => {
      if (p[k]) out.push(['prop:' + p.id + ':' + k, p[k]]);
    });
  });
  CONTRAST.forEach(c => {
    out.push(['contrast:' + c.id + ':left', c.left]);
    out.push(['contrast:' + c.id + ':right', c.right]);
  });
  return out;
}

/* ===================== 分组 / 列标签 ===================== */
test('GROUP_LABEL / PROP_LABEL 取值符合契约', () => {
  assert.deepEqual(GROUP_LABEL, { lap: '拉普拉斯变换对', ssb: '状态空间基础式' });
  assert.deepEqual(PROP_LABEL, { time: '时域 / 判据', freq: '频域', ss: '状态空间' });
});

/* ===================== PAIRS ===================== */
test('PAIRS 仅含 lap / ssb 两个 group 且条目数达到下限', () => {
  const valid = Object.keys(GROUP_MIN);
  const counts = { lap: 0, ssb: 0 };
  PAIRS.forEach(p => {
    assert.ok(valid.includes(p.group), '出现非法 group：' + p.group);
    counts[p.group]++;
  });
  valid.forEach(g => {
    assert.ok(counts[g] >= GROUP_MIN[g], g + ' 条目数不足，期望 ≥ ' + GROUP_MIN[g] + '，实际 ' + counts[g]);
  });
  assert.ok(PAIRS.length >= 24, 'PAIRS 总数应 ≥ 24，实际 ' + PAIRS.length);
});

test('PAIRS 每条含完整字段且 time/transform 为非空 LaTeX', () => {
  PAIRS.forEach(p => {
    assert.ok(p.id && typeof p.id === 'string', 'id 缺失');
    assert.ok(p.name && typeof p.name === 'string', p.id + ' 的 name 缺失');
    assert.equal(typeof p.note, 'string', p.id + ' 的 note 应为字符串');

    assert.ok(typeof p.time === 'string' && p.time.length > 0, p.id + ' 的 time 为空');
    assert.ok(typeof p.transform === 'string' && p.transform.length > 0, p.id + ' 的 transform 为空');
    assert.ok((p.time + p.transform).includes('\\'), p.id + ' 的公式不是 LaTeX（缺少反斜杠）');
  });
});

test('PAIRS 收录题目点名的标准条目', () => {
  const ids = new Set(PAIRS.map(p => p.id));
  [
    // 拉普拉斯变换对
    'lap-delta', 'lap-step', 'lap-ramp', 'lap-power', 'lap-exp',
    'lap-sin', 'lap-cos', 'lap-decay-sin', 'lap-time-shift', 'lap-freq-shift',
    'lap-diff', 'lap-integ', 'lap-conv', 'lap-initial', 'lap-final',
    'lap-first-order', 'lap-second-order',
    'lap-proportional', 'lap-integrator', 'lap-derivative',
    // 状态空间基础式
    'ssb-controllable', 'ssb-observable', 'ssb-tf-to-ss', 'ssb-matrix-exp',
    'ssb-resolvent', 'ssb-stm-property', 'ssb-similarity', 'ssb-char-poly',
    'ssb-state-response',
  ].forEach(id => assert.ok(ids.has(id), '缺少标准条目：' + id));
});

/* ===================== id 唯一性 ===================== */
test('所有 id 全局唯一（PAIRS + PROPS + CONTRAST）', () => {
  const ids = [...PAIRS, ...PROPS, ...CONTRAST].map(x => x.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, [], '存在重复 id：' + dup.join(', '));
  assert.equal(new Set(ids).size, ids.length);
});

/* ===================== PROPS ===================== */
test('PROPS 至少 14 条，出现的 time/freq/ss 为字符串且每条至少填一列', () => {
  assert.ok(PROPS.length >= PROP_MIN, 'PROPS 条目不足，实际 ' + PROPS.length);
  PROPS.forEach(p => {
    assert.ok(p.id && p.name, 'PROPS 条目缺少 id/name');
    ['time', 'freq', 'ss'].forEach(k => {
      if (p[k] !== undefined) assert.equal(typeof p[k], 'string', p.id + ' 的 ' + k + ' 应为字符串');
    });
    const nonEmpty = [p.time, p.freq, p.ss].filter(s => s && s.length > 0);
    assert.ok(nonEmpty.length >= 1, p.id + ' 至少应填 time/freq/ss 中的一列');
    assert.equal(typeof p.note, 'string', p.id + ' 的 note 应为字符串');
  });
});

test('PROPS 多数条目填 2~3 列', () => {
  const filled = PROPS.filter(p => ['time', 'freq', 'ss'].filter(k => p[k] && p[k].length > 0).length >= 2);
  assert.ok(
    filled.length >= Math.ceil(PROPS.length / 2),
    '填 2~3 列的条数应过半，实际 ' + filled.length + '/' + PROPS.length
  );
});

test('PROPS 覆盖题目点名的全部判据 / 性质', () => {
  const ids = new Set(PROPS.map(p => p.id));
  [
    'prop-linear', 'prop-time-invariant', 'prop-causal', 'prop-bibo-stable',
    'prop-routh', 'prop-hurwitz', 'prop-nyquist', 'prop-margins',
    'prop-second-order', 'prop-steady-error', 'prop-root-locus',
    'prop-controllability', 'prop-observability', 'prop-pbh',
    'prop-pole-placement', 'prop-lyapunov', 'prop-observer-error',
  ].forEach(id => assert.ok(ids.has(id), '缺少性质条目：' + id));
});

/* ===================== CONTRAST ===================== */
test('CONTRAST 至少 9 条，且 left / right 非空、取向标签齐备', () => {
  assert.ok(CONTRAST.length >= CONTRAST_MIN, 'CONTRAST 条目不足，实际 ' + CONTRAST.length);
  CONTRAST.forEach(c => {
    assert.ok(c.id && c.concept, 'CONTRAST 条目缺少 id/concept');
    assert.ok(typeof c.lLabel === 'string' && c.lLabel.length > 0, c.id + ' 的 lLabel 为空');
    assert.ok(typeof c.rLabel === 'string' && c.rLabel.length > 0, c.id + ' 的 rLabel 为空');
    assert.ok(typeof c.left === 'string' && c.left.length > 0, c.id + ' 的 left 为空');
    assert.ok(typeof c.right === 'string' && c.right.length > 0, c.id + ' 的 right 为空');
    assert.equal(typeof c.note, 'string', c.id + ' 的 note 应为字符串');
  });
});

/* ===================== TAGS ===================== */
test('TAGS 是非空字符串数组，元素无空值且无重复', () => {
  assert.ok(Array.isArray(TAGS), 'TAGS 应为数组');
  assert.ok(TAGS.length >= 20, 'TAGS 关键词过少，实际 ' + TAGS.length);
  TAGS.forEach(k => assert.ok(typeof k === 'string' && k.length > 0, 'TAGS 含空值'));
  assert.equal(new Set(TAGS).size, TAGS.length, 'TAGS 存在重复关键词');
});

/* ===================== searchTransforms ===================== */
test('searchTransforms：空查询返回全部', () => {
  const r = searchTransforms('');
  assert.equal(r.pairs.length, PAIRS.length);
  assert.equal(r.props.length, PROPS.length);
  assert.equal(r.contrasts.length, CONTRAST.length);

  const r2 = searchTransforms('   ');
  assert.equal(r2.pairs.length, PAIRS.length);
  assert.equal(r2.props.length, PROPS.length);
  assert.equal(r2.contrasts.length, CONTRAST.length);
});

test('searchTransforms：关键词「卷积」命中卷积变换对', () => {
  const r = searchTransforms('卷积');
  assert.ok(r.pairs.some(p => p.id === 'lap-conv'), '应命中卷积定理变换对');
});

test('searchTransforms：group 名 lap / ssb 可命中对应分组', () => {
  const lap = searchTransforms('lap');
  assert.ok(lap.pairs.length > 0 && lap.pairs.every(p => p.group === 'lap'), 'lap 应命中全部拉氏变换对');
  const ssb = searchTransforms('ssb');
  assert.ok(ssb.pairs.length > 0 && ssb.pairs.every(p => p.group === 'ssb'), 'ssb 应命中全部状态空间式');
});

test('searchTransforms：LaTeX 片段可命中', () => {
  assert.ok(searchTransforms('\\delta').pairs.length > 0, 'LaTeX 片段 \\delta 应命中变换对');
  assert.ok(searchTransforms('\\omega').props.length > 0, 'LaTeX 片段 \\omega 应命中性质');
});

test('searchTransforms：大小写不敏感', () => {
  const lower = searchTransforms('pbh');
  const upper = searchTransforms('PBH');
  assert.ok(lower.props.some(p => p.id === 'prop-pbh'));
  assert.deepEqual(
    upper.props.map(p => p.id),
    lower.props.map(p => p.id)
  );
});

test('searchTransforms：多关键词按 AND 过滤', () => {
  assert.ok(searchTransforms('能控性 秩判据').props.some(p => p.id === 'prop-controllability'));
  const none = searchTransforms('能控性 zzz_no_such_token');
  assert.deepEqual(none.props, []);
});

test('searchTransforms：查询不存在的词返回三个空数组', () => {
  const r = searchTransforms('zzz_this_word_does_not_exist_zzz');
  assert.deepEqual(r.pairs, []);
  assert.deepEqual(r.props, []);
  assert.deepEqual(r.contrasts, []);
});

/* ===================== LaTeX 合法性 ===================== */
function countChar(s, ch) {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}
// \left / \right 需成对出现；用负向前瞻排除 \leftrightarrow、\rvert 等
function countCmd(s, cmd) {
  const re = new RegExp('\\\\' + cmd + '(?![a-zA-Z])', 'g');
  return (s.match(re) || []).length;
}
// 反斜杠后面允许出现的字符：命令首字母，或常见转义符号 / 矩阵分隔符
const ESCAPABLE = new Set([',', ';', ':', '!', ' ', '%', '&', '{', '}', '|', '\\']);

test('LaTeX 括号配对检查（圆括号/花括号/方括号/\\left-\\right）', () => {
  allLatex().forEach(([label, s]) => {
    assert.equal(countChar(s, '('), countChar(s, ')'),
      label + ' 圆括号不配对：' + s);
    assert.equal(countChar(s, '{'), countChar(s, '}'),
      label + ' 花括号不配对：' + s);
    assert.equal(countChar(s, '['), countChar(s, ']'),
      label + ' 方括号不配对：' + s);
    assert.equal(countCmd(s, 'left'), countCmd(s, 'right'),
      label + ' \\left / \\right 不成对：' + s);
  });
});

test('LaTeX 合法性检查（无 $ 定界符 / % 已转义 / 反斜杠后有合法字符 / 无悬空反斜杠）', () => {
  allLatex().forEach(([label, s]) => {
    assert.ok(!s.includes('$'), label + ' 不应包含 $ 定界符：' + s);
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '%') {
        assert.equal(s[i - 1], '\\', label + ' 含未转义的 %（注释符）：' + s);
      }
      if (c === '\\') {
        assert.ok(i + 1 < s.length, label + ' 以悬空反斜杠结尾：' + s);
        const next = s[i + 1];
        assert.ok(/[a-zA-Z]/.test(next) || ESCAPABLE.has(next),
          label + ' 反斜杠后为非法字符 "' + next + '"：' + s);
      }
    }
  });
});
