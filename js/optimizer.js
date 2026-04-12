'use strict';
// ─────────────────────────────────────────────
//  OPTIMIZATION PHASE RENDERERS
// ─────────────────────────────────────────────

let currentOptTab = 'fw';

window.switchOptTab = function(tab) {
  currentOptTab = tab;
  ['fw', 'pq', 'dp'].forEach(t => {
    const panel = document.getElementById('opt-' + t);
    const btn = document.getElementById('tab-' + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
};

class Optimizer {
  constructor() {
    this.lastFW = null;
    this.lastOpps = [];
    this.lastPrices = {};
  }

  update(data) {
    this.lastOpps = data.opportunities || [];
    this.lastPrices = data.prices || {};

    if (currentOptTab === 'fw') this._renderFW(data);
    if (currentOptTab === 'pq') this._renderPQ(data);
    if (currentOptTab === 'dp') this._renderDP(data);

    this._renderProofLive(data);
  }

  _renderFW(data) {
    const fw = window.sim.floydWarshall();
    this.lastFW = fw;
    const { d, idx } = fw;
    const box = document.getElementById('fw-matrix');
    if (!box) return;

    const n = EXCHANGES.length;
    let html = '<div class="fw-matrix-wrap"><table class="fw-table"><tr><th></th>';
    EXCHANGES.forEach(e => { html += `<th>${e}</th>`; });
    html += '</tr>';

    for (let i = 0; i < n; i++) {
      html += `<tr><td style="color:var(--text-ter);border:none;font-size:10px;font-family:var(--font-mono)">${EXCHANGES[i]}</td>`;
      for (let j = 0; j < n; j++) {
        const val = d[i][j];
        const isNeg = val < -0.001;
        const isDiag = i === j;
        const isPath = !isDiag && !isNeg && isFinite(val) &&
                       this._isOptimalPath(i, j, fw);

        let cls = isDiag ? 'diag' : isNeg ? 'neg-path' : isPath ? 'best-path' : '';
        const display = isDiag ? '0' : !isFinite(val) ? '∞' : val.toFixed(3);
        html += `<td class="${cls}">${display}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    box.innerHTML = html;
  }

  _isOptimalPath(i, j, fw) {
    if (!this.lastOpps[0]) return false;
    const path = this.lastOpps[0].path;
    for (let k = 0; k < path.length - 1; k++) {
      const ai = EXCHANGES.indexOf(path[k]);
      const bi = EXCHANGES.indexOf(path[k + 1]);
      if (ai === i && bi === j) return true;
    }
    return false;
  }

  _renderPQ(data) {
    const box = document.getElementById('pq-list');
    if (!box) return;
    const opps = this.lastOpps;

    if (opps.length === 0) {
      box.innerHTML = '<div style="padding:12px;font-family:var(--font-mono);font-size:11px;color:var(--text-ter)">No opportunities in queue</div>';
      return;
    }

    const maxP = opps[0].profit || 1;
    box.innerHTML = opps.map((o, i) => {
      const pct = (o.profit / maxP * 100).toFixed(1);
      const pathStr = o.path.join(' → ');
      return `
        <div class="pq-item">
          <div class="pq-rank" style="color:${i === 0 ? 'var(--green)' : 'var(--text-ter)'}">#${i + 1}</div>
          <div class="pq-path">${pathStr}</div>
          <div class="pq-profit">+${o.profit.toFixed(4)}%</div>
          <div class="pq-bar-wrap">
            <div class="pq-bar-fill" style="width:${pct}%;background:${i === 0 ? 'var(--green)' : 'var(--blue)'}"></div>
          </div>
        </div>`;
    }).join('');
  }

  _renderDP(data) {
    const box = document.getElementById('dp-table');
    if (!box) return;
    // For each exchange, find its best single-step outgoing opportunity
    const rows = EXCHANGES.map(ex => {
      let best = null;
      EXCHANGES.forEach(b => {
        if (b === ex) return;
        EXCHANGES.forEach(c => {
          if (c === ex || c === b) return;
          const p = this.lastPrices;
          if (!p[ex] || !p[b] || !p[b][c] || !p[c] || !p[c][ex]) return;
          const r = p[ex][b] * p[b][c] * p[c][ex];
          const profit = (r - 1) * 100;
          if (!best || profit > best.profit) {
            best = { path: [ex, b, c, ex], profit };
          }
        });
      });
      return { ex, best };
    });

    box.innerHTML = '<div class="dp-table-inner">' + rows.map(row => `
      <div class="dp-row">
        <div class="dp-ex">${row.ex}</div>
        <div class="dp-path">${row.best ? row.best.path.join(' → ') : 'no path'}</div>
        <div class="dp-val">${row.best ? '+' + row.best.profit.toFixed(4) + '%' : '—'}</div>
      </div>`
    ).join('') + '</div>';
  }

  _renderProofLive(data) {
    const el = document.getElementById('proof-live-val');
    if (!el) return;
    if (data.opportunities && data.opportunities[0]) {
      const o = data.opportunities[0];
      el.textContent = `${o.logSum.toFixed(5)} (< 0 ✓)`;
      el.style.color = 'var(--green)';
    } else {
      el.textContent = 'no negative cycle detected';
      el.style.color = 'var(--text-ter)';
    }
  }
}

window.optimizer = new Optimizer();
