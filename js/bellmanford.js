'use strict';
// ─────────────────────────────────────────────
//  BELLMAN-FORD STEP-THROUGH VISUALIZER
// ─────────────────────────────────────────────

const BF_STEPS = [
  {
    title: 'Build directed graph',
    sub: 'Exchanges = V, rates = E',
    tag: 'INIT',
    pseudoLines: [0, 1],
    detail: 'Model the market as a directed weighted graph. Each exchange is a vertex V. Each exchange rate r(A→B) is a directed edge. We apply the log-weight transform: w(A→B) = −log(r(A→B)) so that finding the minimum-weight cycle equals finding maximum-profit arbitrage.',
    matrixPhase: 'raw',
  },
  {
    title: 'Initialize distances',
    sub: 'dist[v] = ∞ except source',
    tag: 'SETUP',
    pseudoLines: [2, 3, 4],
    detail: 'Set dist[source] = 0 and dist[all others] = +∞. This models "we start at the source exchange with zero cost, and have not yet found paths to anywhere else."',
    matrixPhase: 'init',
  },
  {
    title: 'Relax edges (V−1 times)',
    sub: 'if dist[u]+w < dist[v]: update',
    tag: 'RELAX',
    pseudoLines: [5, 6, 7, 8],
    detail: 'For each of V−1 iterations, scan every directed edge (u→v). If going through u gives a cheaper path to v than we currently know, update dist[v] = dist[u] + w(u,v). After V−1 passes, all shortest paths without negative cycles are found.',
    matrixPhase: 'relaxed',
  },
  {
    title: 'Vth iteration check',
    sub: 'If dist updates → negative cycle',
    tag: 'CHECK',
    pseudoLines: [9, 10, 11],
    detail: 'Run one more (Vth) edge relaxation pass. If ANY distance still decreases, a negative cycle exists. This works because: in a graph with V nodes, any simple (non-cycle) path uses at most V−1 edges. If a path can still be shortened after V−1 relaxations, it must be looping through a negative cycle.',
    matrixPhase: 'vth',
  },
  {
    title: 'Negative cycle = arbitrage!',
    sub: 'Extract cycle via predecessor chain',
    tag: 'ARB',
    pseudoLines: [12, 13, 14],
    detail: 'Trace back through the predecessor[] array starting at the node whose distance decreased in the Vth pass. Walk backwards V times to guarantee you land inside the cycle. Then trace forward to extract the full cycle. Each edge of the cycle is a profitable currency hop: Buy low → sell high.',
    matrixPhase: 'cycle',
  },
];

const BF_PSEUDOCODE = [
  { text: '// Bellman-Ford for arbitrage detection',         type: 'cm' },
  { text: 'G = buildGraph(exchanges, logWeights)',           type: 'fn' },
  { text: 'dist = {v: Infinity for v in V}',                type: 'kw' },
  { text: 'dist[source] = 0',                               type: 'hl' },
  { text: 'pred = {v: null for v in V}',                    type: 'kw' },
  { text: 'for i in range(|V| - 1):',                       type: 'kw' },
  { text: '  for each edge (u, v, w) in E:',                type: 'kw' },
  { text: '    if dist[u] + w < dist[v]:',                  type: 'hl' },
  { text: '      dist[v] = dist[u] + w',                    type: 'hl' },
  { text: 'for each edge (u, v, w) in E:',                  type: 'kw' },  // Vth pass
  { text: '  if dist[u] + w < dist[v]:',                    type: 'hl' },
  { text: '    negCycleNode = v',                           type: 'fn' },
  { text: 'cycle = traceCycle(pred, negCycleNode)',          type: 'fn' },
  { text: 'profit = product(exp(-w) for w in cycle)',        type: 'fn' },
  { text: 'return cycle, profit',                            type: 'lit'},
];

class BFStepper {
  constructor() {
    this.step = 0;
    this.autoTimer = null;
    this.currentBFResult = null;
    this._render();
    this._renderStepList();
  }

  _renderStepList() {
    const box = document.getElementById('bf-steps');
    if (!box) return;
    box.innerHTML = '';
    BF_STEPS.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'bf-step' + (i === this.step ? ' active' : i < this.step ? ' done' : '');
      el.innerHTML = `
        <div class="bf-step-num">Step ${i + 1} — ${s.tag}</div>
        <div class="bf-step-title">${s.title}</div>
        <div class="bf-step-sub">${s.sub}</div>
      `;
      el.addEventListener('click', () => { this.goto(i); });
      box.appendChild(el);
    });
  }

  _renderPseudo() {
    const box = document.getElementById('bf-pseudo');
    if (!box) return;
    const s = BF_STEPS[this.step];
    const activeLines = s.pseudoLines || [];
    box.innerHTML = BF_PSEUDOCODE.map((line, i) => {
      const isActive = activeLines.includes(i);
      return `<div class="${isActive ? 'active-line' : ''}"><span class="${line.type}">${line.text}</span></div>`;
    }).join('');
  }

  _renderMatrix() {
    const wrap = document.getElementById('bf-matrix-wrap');
    if (!wrap || !this.currentBFResult) return;
    const s = BF_STEPS[this.step];
    const { dist, relaxations } = this.currentBFResult;
    const phase = s.matrixPhase;

    wrap.innerHTML = `<div class="bf-matrix-title">Distance table (${phase === 'raw' ? 'initial' : phase === 'relaxed' ? 'after V−1 passes' : phase === 'vth' ? 'Vth pass' : 'cycle extracted'})</div>`;

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;font-family:var(--font-mono);font-size:11px;width:100%';
    const thead = document.createElement('tr');
    ['Node', 'dist[]', 'State'].forEach(h => {
      const th = document.createElement('th');
      th.style.cssText = 'text-align:left;padding:4px 8px;color:var(--text-ter);border-bottom:1px solid var(--border);font-size:10px;letter-spacing:0.06em';
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);

    EXCHANGES.forEach(e => {
      const tr = document.createElement('tr');
      const d = dist[e];
      const isNeg = d < 0;
      const isInf = !isFinite(d);
      const state = phase === 'raw' ? (e === EXCHANGES[0] ? '← source' : 'unreached') :
                    phase === 'init' ? (e === EXCHANGES[0] ? '= 0 (source)' : '= ∞') :
                    phase === 'relaxed' || phase === 'vth' ? (isNeg ? '! neg path' : isInf ? '∞ (no path)' : 'settled') :
                    (isNeg ? '↻ in cycle!' : 'out of cycle');

      const stateColor = isNeg ? 'var(--green)' : isInf ? 'var(--text-ter)' : 'var(--text-sec)';

      [e, isInf ? '∞' : d.toFixed(4), state].forEach((val, ci) => {
        const td = document.createElement('td');
        td.style.cssText = `padding:4px 8px;border-bottom:1px solid var(--border);color:${ci === 2 ? stateColor : ci === 1 && isNeg ? 'var(--green)' : 'var(--text-sec)'}`;
        td.textContent = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    wrap.appendChild(table);

    // Detail text
    const detail = document.createElement('div');
    detail.style.cssText = 'margin-top:10px;font-size:11px;color:var(--text-sec);line-height:1.7;padding:8px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--blue)';
    detail.textContent = BF_STEPS[this.step].detail;
    wrap.appendChild(detail);
  }

  _updateProgress() {
    const fill = document.getElementById('bf-progress-fill');
    const label = document.getElementById('bf-progress-label');
    if (fill) fill.style.width = ((this.step + 1) / BF_STEPS.length * 100) + '%';
    if (label) label.textContent = `Step ${this.step + 1} / ${BF_STEPS.length}`;
  }

  _render() {
    this._renderStepList();
    this._renderPseudo();
    this._renderMatrix();
    this._updateProgress();
  }

  updateBFResult(result) {
    this.currentBFResult = result;
    this._renderMatrix();
  }

  goto(i) {
    this.step = Math.max(0, Math.min(BF_STEPS.length - 1, i));
    this._render();
  }

  next() {
    this.goto(this.step === BF_STEPS.length - 1 ? 0 : this.step + 1);
  }

  prev() {
    this.goto(this.step === 0 ? BF_STEPS.length - 1 : this.step - 1);
  }

  auto() {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
      return;
    }
    this.autoTimer = setInterval(() => {
      this.next();
      if (this.step === 0 && this.autoTimer) {
        clearInterval(this.autoTimer);
        this.autoTimer = null;
      }
    }, 1800);
  }
}

window.bfStepper = new BFStepper();
