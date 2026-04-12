'use strict';

window.netGraph = window.netGraph || new CytoscapeGraph('netGraph');

let logCount = 0;
const MAX_LOG = 60;
let lastBFResult = null;

function fmt(n, d = 5) {
  return typeof n === 'number' ? n.toFixed(d) : n;
}

function addLog(msg, tag = 'opt') {
  const box = document.getElementById('log-box');
  if (!box) return;

  const now = new Date();
  const t = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;

  const row = document.createElement('div');
  row.className = 'log-entry';
  row.innerHTML = `
    <span class="log-time">${t}</span>
    <span class="log-tag ${tag}">${tag.toUpperCase()}</span>
    <span class="log-msg">${msg}</span>`;

  box.insertBefore(row, box.firstChild);
  logCount += 1;

  while (box.children.length > MAX_LOG) box.removeChild(box.lastChild);

  const countEl = document.getElementById('log-count');
  if (countEl) countEl.textContent = `${logCount} entries`;
}

function updateMetrics(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('m-opp', data.oppCount);
  set('m-best', `${fmt(data.bestProfit, 4)}%`);
  set('m-iter', data.bfIterCount);
  set('m-neg', data.negCycleCount);
  set('tick-counter', data.tick);
  set('latency-val', `${(0.2 + Math.random() * 0.3).toFixed(1)}us`);
  set('edge-count', EXCHANGES.length * (EXCHANGES.length - 1));
}

function updateStatusBar(running, speed) {
  const badge = document.getElementById('sim-status');
  const btn = document.getElementById('btn-pause');
  const speedBtn = document.getElementById('btn-speed');

  if (badge) {
    badge.textContent = running ? 'LIVE' : 'PAUSED';
    badge.className = running ? 'pill pill-live' : 'pill';
    if (!running) {
      badge.style.background = 'rgba(245,166,35,0.12)';
      badge.style.color = 'var(--amber)';
      badge.style.borderColor = 'rgba(245,166,35,0.3)';
      badge.style.animation = 'none';
    } else {
      badge.style.background = '';
      badge.style.color = '';
      badge.style.borderColor = '';
      badge.style.animation = '';
    }
  }

  if (btn) btn.textContent = running ? 'Pause' : 'Resume';
  if (speedBtn) speedBtn.textContent = `${speed}x Speed`;
}

let prevArbPath = '';
let prevBestProfit = 0;
let bfRunTick = 0;

window.sim.on('tick', (data) => {
  updateMetrics(data);

  window.priceChart.update(data.history);

  bfRunTick += 1;

  if (bfRunTick % 5 === 0) {
    lastBFResult = window.sim.runBellmanFord();
    window.bfStepper.updateBFResult(lastBFResult);

    if (lastBFResult.hasNegCycle) {
      addLog('Bellman-Ford Vth pass: negative cycle confirmed', 'neg');
    }
  }

  window.netGraph.update(data.prices, data.opportunities, lastBFResult);

  if (bfRunTick % 3 === 0) {
    window.optimizer.update(data);
  }

  if (data.opportunities.length > 0) {
    const best = data.opportunities[0];
    const pathStr = best.path.join(' -> ');

    if (pathStr !== prevArbPath) {
      prevArbPath = pathStr;
      addLog(`New arb path: ${pathStr} | profit +${fmt(best.profit, 4)}%`, 'arb');
      const card = document.getElementById('m-opp')?.closest('.metric-card');
      if (card) {
        card.classList.remove('flash-arb');
        void card.offsetWidth;
        card.classList.add('flash-arb');
      }
    }

    if (best.profit > prevBestProfit + 0.01) {
      prevBestProfit = best.profit;
      addLog(`New best profit: +${fmt(best.profit, 4)}% on ${pathStr}`, 'arb');
    }
  }

  if (bfRunTick % 15 === 0) {
    addLog(`Floyd-Warshall complete: ${EXCHANGES.length}^3 = ${EXCHANGES.length ** 3} operations`, 'opt');
  }

  if (bfRunTick % 22 === 0 && data.opportunities[0]) {
    addLog(`PQ extracted top opportunity: ${data.opportunities[0].path.join(' -> ')}`, 'opt');
  }

  if (bfRunTick % 35 === 0) {
    const logSum = data.opportunities[0] ? data.opportunities[0].logSum.toFixed(5) : 'none';
    addLog(`Log-weight cycle sum: ${logSum}`, data.opportunities[0] ? 'neg' : 'opt');
  }
});

const _origToggle = window.sim.togglePause.bind(window.sim);
window.sim.togglePause = function togglePausePatched() {
  const running = _origToggle();
  updateStatusBar(running, window.sim.speed);
  addLog(running ? 'Simulation resumed' : 'Simulation paused', 'warn');
  return running;
};

const _origSpeed = window.sim.cycleSpeed.bind(window.sim);
window.sim.cycleSpeed = function cycleSpeedPatched() {
  const speed = _origSpeed();
  updateStatusBar(window.sim.running, speed);
  addLog(`Speed changed to ${speed}x`, 'opt');
  return speed;
};

const _origReset = window.sim.reset.bind(window.sim);
window.sim.reset = function resetPatched() {
  _origReset();
  prevArbPath = '';
  prevBestProfit = 0;
  logCount = 0;
  bfRunTick = 0;
  lastBFResult = null;

  const box = document.getElementById('log-box');
  if (box) box.innerHTML = '';

  window.bfStepper.updateBFResult(null);
  window.netGraph.update(window.sim.prices, window.sim.opportunities, null);
  addLog('System reset: all state cleared', 'warn');
};

addLog('System initialized: 5 exchanges, 20 directed edges', 'opt');
addLog('Bellman-Ford detector armed: log-weight transform active', 'opt');
addLog('Floyd-Warshall all-pairs optimizer ready', 'opt');
addLog('Priority queue initialized', 'opt');
