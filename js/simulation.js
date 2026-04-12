'use strict';
// ─────────────────────────────────────────────
//  SIMULATION ENGINE
// ─────────────────────────────────────────────

const EXCHANGES = ['NSE','BSE','MCX','CME','LSE'];
const EX_COLORS = {
  NSE: '#4d9fff',
  BSE: '#3ddc84',
  MCX: '#f5a623',
  CME: '#a78bfa',
  LSE: '#2dd4bf',
};

class Simulation {
  constructor() {
    this.exchanges = EXCHANGES;
    this.prices = {};       // prices[from][to] = rate
    this.logPrices = {};    // logPrices[from][to] = -log(rate)
    this.history = {};      // history[pair] = [val,...] (last N)
    this.HISTORY_LEN = 80;
    this.opportunities = [];
    this.bestProfit = 0;
    this.oppCount = 0;
    this.negCycleCount = 0;
    this.bfIterCount = 0;
    this.tick = 0;
    this.running = true;
    this.speed = 1;
    this.speeds = [0.5, 1, 2, 5];
    this.speedIdx = 1;
    this.intervalId = null;
    this.listeners = {};
    this._init();
  }

  _init() {
    // Seed prices
    this.exchanges.forEach(a => {
      this.prices[a] = {};
      this.logPrices[a] = {};
      this.exchanges.forEach(b => {
        if (a !== b) {
          this.prices[a][b] = 0.92 + Math.random() * 0.16;
        } else {
          this.prices[a][b] = 1;
        }
      });
    });

    // Init history for key pairs
    const pairs = this._keyPairs();
    pairs.forEach(p => { this.history[p] = []; });

    this._updateLogPrices();
    this._start();
  }

  _keyPairs() {
    return ['NSE-BSE','BSE-MCX','MCX-CME','NSE-CME','BSE-CME','NSE-LSE'];
  }

  _updateLogPrices() {
    this.exchanges.forEach(a => {
      this.exchanges.forEach(b => {
        if (a !== b) {
          const r = this.prices[a][b];
          this.logPrices[a][b] = -Math.log(r);
        } else {
          this.logPrices[a][b] = 0;
        }
      });
    });
  }

  _randomWalk() {
    this.exchanges.forEach(a => {
      this.exchanges.forEach(b => {
        if (a === b) return;
        // random walk with mean reversion to 1.0
        const mu = 0.99;
        const vol = 0.004 + Math.random() * 0.003;
        const drift = (mu - this.prices[a][b]) * 0.02;
        const shock = (Math.random() - 0.5) * vol;
        this.prices[a][b] = Math.max(0.80, Math.min(1.20,
          this.prices[a][b] + drift + shock
        ));
        // Occasionally create a strong drift to force arbitrage
        if (Math.random() < 0.003) {
          this.prices[a][b] *= (1 + (Math.random() - 0.4) * 0.04);
          this.prices[a][b] = Math.max(0.80, Math.min(1.20, this.prices[a][b]));
        }
      });
    });
    this._updateLogPrices();
  }

  _recordHistory() {
    const pairs = this._keyPairs();
    pairs.forEach(p => {
      const [a, b] = p.split('-');
      if (this.prices[a] && this.prices[a][b]) {
        this.history[p].push(+this.prices[a][b].toFixed(5));
        if (this.history[p].length > this.HISTORY_LEN) {
          this.history[p].shift();
        }
      }
    });
  }

  detectArbitrage() {
    const opps = [];
    const exs = this.exchanges;
    for (let i = 0; i < exs.length; i++) {
      for (let j = 0; j < exs.length; j++) {
        for (let k = 0; k < exs.length; k++) {
          if (i === j || j === k || i === k) continue;
          const A = exs[i], B = exs[j], C = exs[k];
          const r = this.prices[A][B] * this.prices[B][C] * this.prices[C][A];
          if (r > 1.001) {
            const profit = (r - 1) * 100;
            const logSum = this.logPrices[A][B] + this.logPrices[B][C] + this.logPrices[C][A];
            opps.push({ path: [A, B, C, A], profit, logSum, r });
          }
        }
      }
    }
    // 4-hop
    for (let i = 0; i < exs.length; i++) {
      for (let j = 0; j < exs.length; j++) {
        for (let k = 0; k < exs.length; k++) {
          for (let l = 0; l < exs.length; l++) {
            const s = new Set([i,j,k,l]);
            if (s.size < 4) continue;
            const A=exs[i],B=exs[j],C=exs[k],D=exs[l];
            const r = this.prices[A][B]*this.prices[B][C]*this.prices[C][D]*this.prices[D][A];
            if (r > 1.003) {
              const profit = (r-1)*100;
              const logSum = this.logPrices[A][B]+this.logPrices[B][C]+this.logPrices[C][D]+this.logPrices[D][A];
              opps.push({ path:[A,B,C,D,A], profit, logSum, r });
            }
          }
        }
      }
    }
    opps.sort((a, b) => b.profit - a.profit);
    return opps.slice(0, 8);
  }

  runBellmanFord() {
    const n = this.exchanges.length;
    const dist = {};
    const pred = {};
    const src = this.exchanges[0];
    this.exchanges.forEach(e => { dist[e] = Infinity; pred[e] = null; });
    dist[src] = 0;

    const relaxations = [];
    // V-1 iterations
    for (let iter = 0; iter < n - 1; iter++) {
      let relaxed = false;
      this.exchanges.forEach(u => {
        this.exchanges.forEach(v => {
          if (u === v) return;
          const w = this.logPrices[u][v];
          if (dist[u] + w < dist[v] - 1e-10) {
            dist[v] = dist[u] + w;
            pred[v] = u;
            relaxed = true;
            relaxations.push({ iter, u, v, w: +w.toFixed(4), dist: +dist[v].toFixed(4) });
          }
        });
      });
      if (!relaxed) break;
    }
    this.bfIterCount++;

    // Vth iteration - detect negative cycle
    let hasNegCycle = false;
    let negCycleNode = null;
    this.exchanges.forEach(u => {
      this.exchanges.forEach(v => {
        if (u === v) return;
        const w = this.logPrices[u][v];
        if (dist[u] !== Infinity && dist[u] + w < dist[v] - 1e-10) {
          hasNegCycle = true;
          negCycleNode = v;
        }
      });
    });

    if (hasNegCycle) this.negCycleCount++;
    return { dist, pred, hasNegCycle, negCycleNode, relaxations };
  }

  floydWarshall() {
    const n = this.exchanges.length;
    const idx = {};
    this.exchanges.forEach((e, i) => { idx[e] = i; });

    const d = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        if (i === j) return 0;
        const a = this.exchanges[i], b = this.exchanges[j];
        return this.logPrices[a][b] ?? Infinity;
      })
    );

    const next = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i !== j ? j : -1))
    );

    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (d[i][k] + d[k][j] < d[i][j] - 1e-10) {
            d[i][j] = d[i][k] + d[k][j];
            next[i][j] = next[i][k];
          }
        }
      }
    }
    return { d, next, idx };
  }

  _step() {
    this._randomWalk();
    this._recordHistory();
    this.tick++;
    this.opportunities = this.detectArbitrage();

    if (this.opportunities.length > 0) {
      const best = this.opportunities[0].profit;
      if (best > this.bestProfit) this.bestProfit = best;
      this.oppCount++;
    }

    this.emit('tick', {
      tick: this.tick,
      prices: this.prices,
      logPrices: this.logPrices,
      history: this.history,
      opportunities: this.opportunities,
      bestProfit: this.bestProfit,
      oppCount: this.oppCount,
      negCycleCount: this.negCycleCount,
      bfIterCount: this.bfIterCount,
    });
  }

  _start() {
    const interval = 350 / this.speed;
    this.intervalId = setInterval(() => {
      if (this.running) this._step();
    }, interval);
  }

  _restart() {
    clearInterval(this.intervalId);
    this._start();
  }

  togglePause() {
    this.running = !this.running;
    return this.running;
  }

  cycleSpeed() {
    this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
    this.speed = this.speeds[this.speedIdx];
    this._restart();
    return this.speed;
  }

  reset() {
    clearInterval(this.intervalId);
    this.oppCount = 0;
    this.bestProfit = 0;
    this.negCycleCount = 0;
    this.bfIterCount = 0;
    this.tick = 0;
    this.opportunities = [];
    this._init();
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}

window.sim = new Simulation();
window.EXCHANGES = EXCHANGES;
window.EX_COLORS = EX_COLORS;
