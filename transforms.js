/* =========================================================
   自控 · 现控 复习本 · transforms.js
   公式与变换速查表数据模块：拉普拉斯变换对、状态空间基础式、
   时域/频域/状态空间判据、经典↔现代控制对照。
   纯数据 + 纯函数，完全不接触 DOM。
   浏览器以经典脚本加载（挂到 window.MQT）；Node 下可作为模块被单测引用。

   说明：
   - time / transform / freq / ss / left / right 均为 LaTeX 字符串，
     交给 KaTeX 渲染，因此反斜杠需在 JS 字符串里双写（如 '\\sin'）。
   - note / lLabel / rLabel 为普通说明文本（适用条件 / 取向），不要求是 LaTeX。
   - 只收录教材通用标准结论（胡寿松《自动控制原理》、郑大钟《线性系统理论》、
     刘豹《现代控制理论》），不予收录没有十足把握者。
   - 全站共享一张速查表（不分科目），同时服务《自动控制原理》(ac)
     与《现代控制》(lc)。
   符号约定：拉普拉斯变换用 X(s)，状态向量用 x，输入用 u，输出用 y，
   状态转移矩阵用 Φ(t)=e^{At}，采样周期用 T。
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MQT = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 速查表分组 / 列标签 ---------- */
  const GROUP_LABEL = { lap: '拉普拉斯变换对', ssb: '状态空间基础式' };
  const PROP_LABEL = { time: '时域 / 判据', freq: '频域', ss: '状态空间' };

  /* ---------- 变换对 ---------- */
  const PAIRS = [
    /* ===== 拉普拉斯变换对（lap）===== */
    {
      id: 'lap-delta', group: 'lap', name: '单位冲激 δ(t)',
      time: '\\delta(t)',
      transform: '1\\quad(\\forall\\,s)',
      note: 'ROC 为整个 s 平面',
    },
    {
      id: 'lap-step', group: 'lap', name: '单位阶跃 u(t)',
      time: '\\mathrm{u}(t)',
      transform: '\\frac{1}{s}',
      note: 'ROC：Re{s} > 0',
    },
    {
      id: 'lap-ramp', group: 'lap', name: '单位斜坡 t·u(t)',
      time: 't\\,\\mathrm{u}(t)',
      transform: '\\frac{1}{s^{2}}',
      note: 'ROC：Re{s} > 0',
    },
    {
      id: 'lap-power', group: 'lap', name: '幂函数 tⁿu(t)',
      time: 't^{n}\\mathrm{u}(t)',
      transform: '\\frac{n!}{s^{n+1}}',
      note: 'n 为非负整数；ROC：Re{s} > 0',
    },
    {
      id: 'lap-exp', group: 'lap', name: '指数函数 e^{−at}u(t)',
      time: 'e^{-at}\\mathrm{u}(t)',
      transform: '\\frac{1}{s+a}',
      note: '极点 s = −a；ROC：Re{s} > −a',
    },
    {
      id: 'lap-sin', group: 'lap', name: '正弦 sin(ωt)u(t)',
      time: '\\sin(\\omega t)\\,\\mathrm{u}(t)',
      transform: '\\frac{\\omega}{s^{2}+\\omega^{2}}',
      note: 'ROC：Re{s} > 0；一对共轭虚极点 s = ±jω',
    },
    {
      id: 'lap-cos', group: 'lap', name: '余弦 cos(ωt)u(t)',
      time: '\\cos(\\omega t)\\,\\mathrm{u}(t)',
      transform: '\\frac{s}{s^{2}+\\omega^{2}}',
      note: 'ROC：Re{s} > 0；一对共轭虚极点 s = ±jω',
    },
    {
      id: 'lap-decay-sin', group: 'lap', name: '衰减正弦 e^{−at}sin(ωt)u(t)',
      time: 'e^{-at}\\sin(\\omega t)\\,\\mathrm{u}(t)',
      transform: '\\frac{\\omega}{(s+a)^{2}+\\omega^{2}}',
      note: 'ROC：Re{s} > −a；共轭极点 s = −a ± jω',
    },
    {
      id: 'lap-time-shift', group: 'lap', name: '时移 x(t−τ)u(t−τ)',
      time: 'x(t-\\tau)\\,\\mathrm{u}(t-\\tau)',
      transform: 'e^{-s\\tau}X(s)',
      note: '时移（延时）定理：τ ≥ 0，X(s) 为 x(t) 的拉氏变换',
    },
    {
      id: 'lap-freq-shift', group: 'lap', name: '复频移 e^{s₀t}x(t)',
      time: 'e^{s_0 t}\\,x(t)',
      transform: 'X(s-s_0)',
      note: '复频移（s 域平移）定理；与衰减因子 e^{−at} 配合使用',
    },
    {
      id: 'lap-diff', group: 'lap', name: '微分 d/dt',
      time: '\\dfrac{d}{dt}x(t)',
      transform: 'sX(s)-x(0^{-})',
      note: '微分定理；零初始条件下为 sX(s)',
    },
    {
      id: 'lap-integ', group: 'lap', name: '积分 ∫₀ᵗ',
      time: '\\int_{0^{-}}^{t}x(\\tau)\\,d\\tau',
      transform: '\\frac{1}{s}X(s)',
      note: '积分定理；零初始条件下为 X(s)/s',
    },
    {
      id: 'lap-conv', group: 'lap', name: '卷积 x(t)*h(t)',
      time: 'x(t)*h(t)',
      transform: 'X(s)\\,H(s)',
      note: '卷积定理；零初始条件下时域卷积对应 s 域相乘',
    },
    {
      id: 'lap-initial', group: 'lap', name: '初值定理',
      time: 'x(0^{+})',
      transform: '\\lim_{s\\to\\infty}sX(s)',
      note: '要求 X(s) 为真有理函数（分母阶次高于分子）',
    },
    {
      id: 'lap-final', group: 'lap', name: '终值定理',
      time: '\\lim_{t\\to\\infty}x(t)',
      transform: '\\lim_{s\\to 0}sX(s)',
      note: '要求 sX(s) 的极点全部位于左半 s 平面（s = 0 处至多单极点）',
    },
    {
      id: 'lap-first-order', group: 'lap', name: '一阶惯性环节 1/(Ts+1)',
      time: '\\frac{1}{Ts+1}',
      transform: '\\frac{1/T}{s+1/T}',
      note: 'T > 0 为时间常数；单极点 s = −1/T，阶跃响应无超调',
    },
    {
      id: 'lap-second-order', group: 'lap', name: '二阶振荡环节',
      time: '\\frac{\\omega_n^{2}}{s^{2}+2\\zeta\\omega_n s+\\omega_n^{2}}',
      transform: '\\frac{\\omega_n^{2}}{(s+\\zeta\\omega_n)^{2}+\\omega_d^{2}}',
      note: '0<ζ<1 欠阻尼，阻尼振荡频率 ω_d=ω_n√(1−ζ²)；ζ≥1 时无振荡',
    },
    {
      id: 'lap-proportional', group: 'lap', name: '比例环节 K',
      time: 'K\\,\\delta(t)',
      transform: 'K',
      note: '增益环节，输出为输入的 K 倍（冲激响应为 Kδ(t)）',
    },
    {
      id: 'lap-integrator', group: 'lap', name: '积分环节 K/s',
      time: 'K\\,\\mathrm{u}(t)',
      transform: '\\frac{K}{s}',
      note: '无差环节；阶跃输入下输出为斜坡，抬高系统型别',
    },
    {
      id: 'lap-derivative', group: 'lap', name: '微分环节 Ks',
      time: 'K\\,\\delta^{\\prime}(t)',
      transform: 'K s',
      note: '理想微分不易物理实现，工程上常用 [KTs/(Ts+1)] 近似',
    },

    /* ===== 状态空间基础式（ssb）===== */
    {
      id: 'ssb-state-eq', group: 'ssb', name: '状态方程与输出方程',
      time: '\\dot{x}=Ax+Bu',
      transform: 'y=Cx+Du',
      note: '线性定常连续系统；x∈Rⁿ 为状态向量，u 为输入，y 为输出',
    },
    {
      id: 'ssb-controllable', group: 'ssb', name: '可控标准型',
      time: 'A=\\begin{bmatrix}0&1&0\\\\ 0&0&1\\\\ -a_0&-a_1&-a_2\\end{bmatrix}',
      transform: 'B=\\begin{bmatrix}0\\\\ 0\\\\ 1\\end{bmatrix}',
      note: '由传递函数分母系数 a_i 构造；单输入系统常用规范形式',
    },
    {
      id: 'ssb-observable', group: 'ssb', name: '可观标准型',
      time: 'A=\\begin{bmatrix}0&0&-a_0\\\\ 1&0&-a_1\\\\ 0&1&-a_2\\end{bmatrix}',
      transform: 'C=\\begin{bmatrix}0&0&1\\end{bmatrix}',
      note: '对偶于可控标准型；单输出系统常用规范形式',
    },
    {
      id: 'ssb-tf-to-ss', group: 'ssb', name: '由传递函数写 A、B、C、D',
      time: 'G(s)=\\dfrac{b_m s^{m}+\\cdots+b_1 s+b_0}{s^{n}+a_{n-1}s^{n-1}+\\cdots+a_0}',
      transform: 'A,\\,B,\\,C,\\,D\\ \\text{from controllable/observable canonical form}',
      note: '严格真分式时 D=0；分子分母同阶时 D=b_n（直通项）',
    },
    {
      id: 'ssb-matrix-exp', group: 'ssb', name: '矩阵指数 e^{At}',
      time: 'e^{At}=I+At+\\frac{1}{2!}A^{2}t^{2}+\\cdots',
      transform: '\\mathcal{L}^{-1}\\{(sI-A)^{-1}\\}',
      note: 'A 为 n×n 常矩阵；e^{At} 即状态转移矩阵 Φ(t)',
    },
    {
      id: 'ssb-resolvent', group: 'ssb', name: '预解矩阵 (sI−A)⁻¹',
      time: '(sI-A)^{-1}',
      transform: '\\frac{\\operatorname{adj}(sI-A)}{\\det(sI-A)}',
      note: '伴随矩阵法求预解矩阵；其拉氏反变换即 e^{At}',
    },
    {
      id: 'ssb-stm-property', group: 'ssb', name: '状态转移矩阵 Φ(t)=e^{At} 的性质',
      time: '\\Phi(0)=I,\\quad \\Phi(t_2-t_0)=\\Phi(t_2-t_1)\\Phi(t_1-t_0)',
      transform: '\\Phi^{-1}(t)=\\Phi(-t)',
      note: '传递（半群）性质与可逆性质；满足 Φ′(t)=AΦ(t)，Φ 与 A 可交换',
    },
    {
      id: 'ssb-similarity', group: 'ssb', name: '相似变换',
      time: '\\bar{A}=P^{-1}AP',
      transform: '\\bar{B}=P^{-1}B,\\quad \\bar{C}=CP',
      note: 'P 为非奇异矩阵；特征多项式与极点（特征值）在相似变换下不变',
    },
    {
      id: 'ssb-char-poly', group: 'ssb', name: '特征多项式与极点',
      time: '\\det(sI-A)=s^{n}+a_{n-1}s^{n-1}+\\cdots+a_0',
      transform: '\\det(\\lambda_i I-A)=0',
      note: 'A 的特征值 λᵢ 即系统极点，也是 G(s) 的极点',
    },
    {
      id: 'ssb-output-tf', group: 'ssb', name: '由状态空间求传递函数',
      time: 'G(s)=C(sI-A)^{-1}B+D',
      transform: 'G(s)=\\dfrac{C\\,\\operatorname{adj}(sI-A)\\,B+D\\det(sI-A)}{\\det(sI-A)}',
      note: '单入单出；极点由 det(sI−A) 决定，零点由分子确定',
    },
    {
      id: 'ssb-state-response', group: 'ssb', name: '状态响应 X(s)',
      time: 'X(s)=(sI-A)^{-1}x(0)+(sI-A)^{-1}BU(s)',
      transform: 'x(t)=e^{At}x(0)+\\int_{0}^{t}e^{A(t-\\tau)}Bu(\\tau)\\,d\\tau',
      note: '由状态方程取拉氏变换得到：前项零输入响应，后项零状态响应',
    },
  ];

  /* ---------- 时域 / 频域 / 状态空间（PROPS） ---------- */
  const PROPS = [
    {
      id: 'prop-linear', name: '线性',
      time: 'x_1\\to y_1,\\ x_2\\to y_2\\ \\Rightarrow\\ a x_1+b x_2\\to a y_1+b y_2',
      ss: '\\dot{x}=Ax+Bu,\\quad y=Cx+Du',
      note: '满足齐次性与可加性（叠加原理）',
    },
    {
      id: 'prop-time-invariant', name: '时不变',
      time: 'x(t-\\tau)\\to y(t-\\tau)',
      ss: '\\dot{x}=Ax+Bu,\\quad A,\\,B,\\,C,\\,D\\ \\text{constant}',
      note: '系统参数不随时间变化；数学描述为定常（线性定常系统）',
    },
    {
      id: 'prop-causal', name: '因果',
      time: 'h(t)=0,\\quad t<0',
      ss: 'y=Cx+Du',
      note: '输出不超前于输入，是物理可实现系统的必要条件',
    },
    {
      id: 'prop-bibo-stable', name: 'BIBO 稳定',
      time: '\\int_{0}^{\\infty}\\lvert h(t)\\rvert\\,dt<\\infty',
      freq: '\\operatorname{Re}\\{s_i\\}<0',
      note: '有界输入必有有界输出；充分必要条件是冲激响应绝对可积',
    },
    {
      id: 'prop-routh', name: '劳斯判据',
      time: 'D(s)=a_n s^{n}+a_{n-1}s^{n-1}+\\cdots+a_0',
      ss: '\\operatorname{Re}\\{\\lambda_i(A)\\}<0',
      note: '劳斯表首列全部同号（均为正）⇔ 系统稳定；首列变号次数=右半平面极点数',
    },
    {
      id: 'prop-hurwitz', name: '赫尔维茨判据',
      time: 'a_0>0,\\ \\Delta_1>0,\\ \\Delta_2>0,\\ \\ldots,\\ \\Delta_n>0',
      ss: 'A\\ \\text{is Hurwitz}',
      note: '赫尔维茨行列式 Δᵢ（特征方程系数构成的顺序主子式）全大于零 ⇔ 稳定',
    },
    {
      id: 'prop-nyquist', name: '奈奎斯特判据',
      freq: 'Z=N+P',
      note: 'P 为开环右半平面极点数，N 为开环奈奎斯特曲线绕 (−1, j0) 的净圈数，Z 为闭环右半平面极点数；Z=0 时闭环稳定',
    },
    {
      id: 'prop-margins', name: '幅值裕度与相角裕度',
      time: '\\gamma=180^{\\circ}+\\varphi(\\omega_c)',
      freq: 'K_g=\\dfrac{1}{\\lvert G(j\\omega_g)H(j\\omega_g)\\rvert}',
      note: 'ω_c 为幅值穿越频率（|GH|=1），ω_g 为相位穿越频率（∠GH=−180°）；裕度越大相对稳定性越好',
    },
    {
      id: 'prop-second-order', name: '二阶系统动态指标',
      time: '\\sigma\\%=\\mathrm{e}^{-\\zeta\\pi/\\sqrt{1-\\zeta^{2}}}\\times 100\\%,\\quad t_p=\\dfrac{\\pi}{\\omega_n\\sqrt{1-\\zeta^{2}}},\\quad t_s\\approx\\dfrac{3}{\\zeta\\omega_n}',
      freq: 'M_r=\\dfrac{1}{2\\zeta\\sqrt{1-\\zeta^{2}}},\\quad \\omega_r=\\omega_n\\sqrt{1-2\\zeta^{2}}',
      note: '欠阻尼 0<ζ<1，ω_d=ω_n√(1−ζ²)；ts 按 ±5% 误差带取 3/(ζω_n)',
    },
    {
      id: 'prop-steady-error', name: '稳态误差与系统型别',
      time: 'e_{ss}=\\lim_{s\\to 0}\\dfrac{s\\,R(s)}{1+G(s)H(s)}',
      freq: 'K_p=\\lim_{s\\to 0}G(s),\\quad K_v=\\lim_{s\\to 0}sG(s),\\quad K_a=\\lim_{s\\to 0}s^{2}G(s)',
      note: '0 型系统阶跃输入有差；I 型阶跃无差、斜坡有差；II 型斜坡无差、加速度有差',
    },
    {
      id: 'prop-root-locus', name: '根轨迹基本法则',
      time: '\\lvert G(s)H(s)\\rvert=1,\\quad \\angle G(s)H(s)=(2k+1)180^{\\circ}',
      freq: 'D(j\\omega)=0',
      note: '相角条件决定根轨迹、幅值条件确定增益 k；分支数=n，起于开环极点、终于开环零点，与虚轴交点由 D(jω)=0 求得',
    },
    {
      id: 'prop-controllability', name: '能控性秩判据',
      ss: '\\operatorname{rank}\\,[B\\ \\ AB\\ \\ \\cdots\\ \\ A^{n-1}B]=n',
      note: '能控性矩阵 Q_c=[B AB … A^{n−1}B] 满秩（秩为 n）⇔ 状态完全能控',
    },
    {
      id: 'prop-observability', name: '能观性秩判据',
      ss: '\\operatorname{rank}\\,\\begin{bmatrix}C\\\\ CA\\\\ \\vdots\\\\ CA^{n-1}\\end{bmatrix}=n',
      note: '能观性矩阵 Q_o=[C; CA; …; CA^{n−1}] 满秩（秩为 n）⇔ 状态完全能观',
    },
    {
      id: 'prop-pbh', name: 'PBH 秩判据',
      ss: '\\operatorname{rank}\\,[\\lambda_i I-A\\ \\ B]=n',
      note: '对所有特征值 λᵢ（i=1…n）成立 ⇔ 能控；能观的对偶形式为 rank[λᵢI−A; C]ᵀ=n',
    },
    {
      id: 'prop-pole-placement', name: '极点配置条件',
      ss: '\\det(sI-A+BK)=\\prod_{i=1}^{n}(s-\\mu_i)',
      note: '系统 (A,B) 能控 ⇔ 存在状态反馈 K 使 A−BK 的极点配置到任意期望位置（复极点须共轭成对）',
    },
    {
      id: 'prop-lyapunov', name: '李雅普诺夫方程（稳定判据）',
      ss: 'A^{\\mathsf T}P+PA=-Q',
      note: '取 Q>0（正定）；存在正定解 P>0 ⇔ A 全部特征值具有负实部（渐近稳定）',
    },
    {
      id: 'prop-observer-error', name: '观测器误差方程',
      ss: '\\dot{e}=(A-LC)e,\\quad e=x-\\hat{x}',
      note: '全维状态观测器 ẋ̂=Ax̂+Bu+L(y−Cx̂)；选 L 使 A−LC 极点位于期望位置（须 (A,C) 能观）',
    },
  ];

  /* ---------- 经典 ↔ 现代 / 连续 ↔ 离散 对照 ---------- */
  const CONTRAST = [
    {
      id: 'contrast-s-z', concept: 's 平面 ↔ z 平面',
      lLabel: '连续时间 (s 域)', left: 'z=e^{sT}',
      rLabel: '离散时间 (z 域)', right: 's=\\dfrac{1}{T}\\ln z',
      note: 'T 为采样周期；s 左半平面映射到 z 平面单位圆内',
    },
    {
      id: 'contrast-laplace-z', concept: '拉普拉斯变换 ↔ Z 变换',
      lLabel: '拉普拉斯变换 (s 域)', left: 'X(s)=\\int_{0}^{\\infty}x(t)e^{-st}\\,dt',
      rLabel: 'Z 变换 (z 域)', right: 'X(z)=\\sum_{n=0}^{\\infty}x[n]z^{-n}',
      note: '采样序列的 Z 变换可由连续信号拉氏变换经 z=e^{sT} 映射得到',
    },
    {
      id: 'contrast-stability', concept: '稳定性判据区域',
      lLabel: '连续系统 (s 平面)', left: '\\mathrm{Re}\\{s\\}<0',
      rLabel: '离散系统 (z 平面)', right: '\\lvert z\\rvert<1',
      note: '连续：极点须在左半 s 平面；离散因果：极点须在单位圆内',
    },
    {
      id: 'contrast-tf-ss', concept: '传递函数 ↔ 状态空间',
      lLabel: '传递函数', left: 'G(s)=\\dfrac{Y(s)}{U(s)}',
      rLabel: '状态空间', right: '\\dot{x}=Ax+Bu,\\quad y=Cx+Du',
      note: '同一系统的两种描述；零初始条件下 G(s)=C(sI−A)⁻¹B+D',
    },
    {
      id: 'contrast-classic-modern', concept: '经典控制 ↔ 现代控制',
      lLabel: '经典控制', left: 'G(s)=\\dfrac{b_ms^{m}+\\cdots+b_0}{s^{n}+a_{n-1}s^{n-1}+\\cdots+a_0}',
      rLabel: '现代控制', right: '(A,\\,B,\\,C,\\,D)',
      note: '经典用传递函数/频域法，限于单入单出与零初始；现代用状态空间，可处理多变量与非零初值',
    },
    {
      id: 'contrast-cont-discrete-ss', concept: '连续状态空间 ↔ 离散状态空间',
      lLabel: '连续状态空间', left: '\\dot{x}=Ax+Bu',
      rLabel: '离散状态空间', right: '\\Phi=e^{AT},\\quad \\Gamma=\\int_{0}^{T}e^{A\\tau}\\,d\\tau\\,B',
      note: '采样周期 T；离散化后 x[k+1]=Φx[k]+Γu[k]',
    },
    {
      id: 'contrast-ode-ss', concept: '微分方程 ↔ 状态方程',
      lLabel: '高阶微分方程', left: 'y^{(n)}+a_{n-1}y^{(n-1)}+\\cdots+a_0 y=b_0 u',
      rLabel: '状态方程', right: '\\dot{x}=Ax+Bu,\\quad y=Cx+Du',
      note: '选取状态变量把 n 阶微分方程化为一阶方程组；可控/可观标准型为规范形式',
    },
    {
      id: 'contrast-locus-eigen', concept: '根轨迹 ↔ 特征值轨迹',
      lLabel: '根轨迹（经典）', left: '\\lvert G(s)H(s)\\rvert=1,\\quad \\angle G(s)H(s)=(2k+1)180^{\\circ}',
      rLabel: '特征值轨迹（现代）', right: '\\det(sI-A(k))=0',
      note: '参数（增益 k）变化时特征值随之移动；根轨迹即闭环特征值轨迹',
    },
    {
      id: 'contrast-routh-lyap', concept: '劳斯判据 ↔ LMI / 李雅普诺夫判据',
      lLabel: '劳斯判据（经典）', left: 's^{n}+a_{n-1}s^{n-1}+\\cdots+a_0=0,\\quad a_i>0',
      rLabel: 'LMI / 李雅普诺夫判据（现代）', right: 'A^{\\mathsf T}P+PA<0,\\quad P>0',
      note: '劳斯/赫尔维茨用特征方程系数判稳；李雅普诺夫用矩阵方程/LMI，可推广到多变量与非线性',
    },
    {
      id: 'contrast-siso-mimo', concept: '单输入单输出 ↔ 多输入多输出',
      lLabel: '单输入单输出 (SISO)', left: 'G(s)=\\dfrac{Y(s)}{U(s)}',
      rLabel: '多输入多输出 (MIMO)', right: '\\mathbf{Y}(s)=G(s)\\,\\mathbf{U}(s)',
      note: 'SISO 用标量传递函数；MIMO 用传递函数矩阵，通道间存在耦合，经典法不再直接适用',
    },
  ];

  /* ---------- 搜索关键词（全站共享，供速查表搜索提示 / 预设标签使用） ---------- */
  const TAGS = [
    '冲激', '阶跃', '斜坡', '幂函数', '指数', '正弦', '余弦', '衰减正弦',
    '时移', '延时', '复频移', '微分', '积分', '卷积', '初值定理', '终值定理',
    '惯性环节', '振荡环节', '比例环节', '积分环节', '微分环节', '拉普拉斯', '拉氏变换',
    '传递函数', '可控标准型', '可观标准型', '能控标准型', '能观标准型',
    '矩阵指数', '预解矩阵', '状态转移矩阵', '相似变换', '特征多项式', '极点', '状态方程', '输出方程',
    '线性', '时不变', '因果', 'BIBO', '稳定', '劳斯判据', '赫尔维茨判据', '奈奎斯特',
    '幅值裕度', '相角裕度', '超调量', '峰值时间', '调节时间', '稳态误差', '系统型别',
    '根轨迹', '能控性', '能观性', 'PBH', '极点配置', '李雅普诺夫', '观测器',
    '连续时间', '离散时间', 's域', 'z域', '经典控制', '现代控制', 'SISO', 'MIMO',
  ];

  /* ---------- 纯函数：搜索 ---------- */
  function lower(s) {
    return String(s == null ? '' : s).toLowerCase();
  }
  // 把一条内容拼成可搜索的文本（在名称 / 公式 / 说明上做关键词匹配）
  function haystackPair(p) {
    return lower([p.group, p.name, p.time, p.transform, p.note].join(' '));
  }
  function haystackProp(p) {
    return lower([p.name, p.time, p.freq, p.ss, p.note].join(' '));
  }
  function haystackContrast(c) {
    return lower([c.concept, c.lLabel, c.left, c.rLabel, c.right, c.note].join(' '));
  }

  // 关键词过滤：中文名、英文记号、LaTeX 片段均可；多个词按 AND；空查询返回全部。
  function searchTransforms(query) {
    const q = lower(query).trim();
    if (!q) {
      return { pairs: PAIRS.slice(), props: PROPS.slice(), contrasts: CONTRAST.slice() };
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const hit = hay => tokens.every(t => hay.includes(t));
    return {
      pairs: PAIRS.filter(p => hit(haystackPair(p))),
      props: PROPS.filter(p => hit(haystackProp(p))),
      contrasts: CONTRAST.filter(c => hit(haystackContrast(c))),
    };
  }

  return {
    PAIRS, PROPS, CONTRAST, TAGS,
    GROUP_LABEL, PROP_LABEL,
    searchTransforms,
  };
});
