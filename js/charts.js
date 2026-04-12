'use strict';
// ─────────────────────────────────────────────
//  PRICE CHART
// ─────────────────────────────────────────────

const PAIR_COLORS = {
  'NSE-BSE': '#4d9fff',
  'BSE-MCX': '#3ddc84',
  'MCX-CME': '#f5a623',
  'NSE-CME': '#a78bfa',
  'NSE-LSE': '#2dd4bf',
  'BSE-CME': '#ff5b5b',
};

const ACTIVE_PAIRS = new Set(['NSE-BSE', 'BSE-MCX', 'MCX-CME', 'NSE-CME']);

class PriceChart {
  constructor() {
    const ctx = document.getElementById('priceChart');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: this._buildDatasets(),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: 'rgba(255,255,255,0.4)',
              font: { family: 'JetBrains Mono', size: 10 },
              boxWidth: 12,
              padding: 8,
            },
          },
          tooltip: {
            backgroundColor: '#1c2230',
            titleColor: 'rgba(255,255,255,0.7)',
            bodyColor: 'rgba(255,255,255,0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleFont: { family: 'JetBrains Mono', size: 10 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(5)}`,
            },
          },
        },
        scales: {
          x: {
            display: false,
          },
          y: {
            ticks: {
              color: 'rgba(255,255,255,0.3)',
              font: { family: 'JetBrains Mono', size: 9 },
              maxTicksLimit: 5,
              callback: v => v.toFixed(4),
            },
            grid: {
              color: 'rgba(255,255,255,0.04)',
            },
            border: { dash: [2, 4], color: 'transparent' },
          },
        },
      },
    });
  }

  _buildDatasets() {
    return Object.keys(PAIR_COLORS).map(pair => ({
      label: pair,
      data: [],
      borderColor: PAIR_COLORS[pair],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.4,
      hidden: !ACTIVE_PAIRS.has(pair),
    }));
  }

  update(history) {
    if (!this.chart) return;
    const allPairs = Object.keys(PAIR_COLORS);
    const maxLen = Math.max(...allPairs.map(p => (history[p] || []).length));

    this.chart.data.labels = Array.from({ length: maxLen }, (_, i) => i);

    this.chart.data.datasets.forEach(ds => {
      const pair = ds.label;
      ds.data = history[pair] || [];
    });

    this.chart.update('none');
  }

  togglePair(pair, active) {
    if (!this.chart) return;
    const ds = this.chart.data.datasets.find(d => d.label === pair);
    if (ds) {
      ds.hidden = !active;
      if (active) ACTIVE_PAIRS.add(pair);
      else ACTIVE_PAIRS.delete(pair);
      this.chart.update('none');
    }
  }
}

window.priceChart = new PriceChart();

window.togglePair = function(btn, pair) {
  const isActive = btn.classList.toggle('active');
  window.priceChart.togglePair(pair, isActive);
};
