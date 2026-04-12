'use strict';

class CytoscapeGraph {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.showWeights = false;
    this.showArb = true;
    this.showStates = true;
    this.lastArbPath = [];
    this.lastTapTs = 0;
    this.dashOffset = 0;

    if (!this.container || typeof window.cytoscape !== 'function') {
      console.warn('Cytoscape not available; graph controls disabled.');
      this.disabled = true;
      return;
    }

    this.cy = cytoscape({
      container: this.container,
      elements: this._buildElements(),
      wheelSensitivity: 0.2,
      style: this._style(),
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 40,
        nodeRepulsion: 9000,
        edgeElasticity: 80,
      },
    });

    this._bindEvents();
    this._tickArbDash();
  }

  _buildElements() {
    const elements = [];

    EXCHANGES.forEach((ex) => {
      elements.push({
        data: { id: `ex-${ex}`, label: ex, kind: 'exchange', baseColor: EX_COLORS[ex] || '#4d9fff' },
        classes: 'exchange-node',
      });
    });

    EXCHANGES.forEach((a) => {
      EXCHANGES.forEach((b) => {
        if (a === b) return;
        elements.push({
          data: {
            id: this._edgeId(a, b),
            source: `ex-${a}`,
            target: `ex-${b}`,
            kind: 'rate',
            rate: 1,
            label: '',
          },
          classes: 'rate-edge',
        });
      });
    });

    const states = [
      { id: 'st-BF_INIT', label: 'BF_INIT' },
      { id: 'st-BF_RELAX', label: 'BF_RELAX' },
      { id: 'st-BF_CHECK', label: 'BF_CHECK' },
      { id: 'st-NEG_CYCLE', label: 'NEG_CYCLE' },
      { id: 'st-FW_UPDATE', label: 'FW_UPDATE' },
      { id: 'st-PQ_TOP', label: 'PQ_TOP' },
    ];

    states.forEach((s) => {
      elements.push({
        data: { id: s.id, label: s.label, kind: 'state' },
        classes: 'state-node',
      });
    });

    const stateFlow = [
      ['st-BF_INIT', 'st-BF_RELAX'],
      ['st-BF_RELAX', 'st-BF_CHECK'],
      ['st-BF_CHECK', 'st-NEG_CYCLE'],
      ['st-BF_CHECK', 'st-FW_UPDATE'],
      ['st-FW_UPDATE', 'st-PQ_TOP'],
      ['st-PQ_TOP', 'st-BF_RELAX'],
    ];

    stateFlow.forEach(([from, to], idx) => {
      elements.push({
        data: {
          id: `state-flow-${idx}`,
          source: from,
          target: to,
          kind: 'state-flow',
        },
        classes: 'state-edge',
      });
    });

    return elements;
  }

  _style() {
    return [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          color: '#e8edf5',
          'font-family': 'JetBrains Mono',
          'font-size': 11,
          'text-valign': 'center',
          'text-halign': 'center',
          'text-outline-width': 0,
        },
      },
      {
        selector: 'node.exchange-node',
        style: {
          width: 42,
          height: 42,
          'background-color': 'data(baseColor)',
          'border-color': '#ffffff22',
          'border-width': 1.2,
          'shadow-blur': 18,
          'shadow-color': 'data(baseColor)',
          'shadow-opacity': 0.3,
        },
      },
      {
        selector: 'node.state-node',
        style: {
          width: 30,
          height: 30,
          'font-size': 8,
          color: '#a9b6c6',
          'background-color': '#2a3242',
          'border-color': '#6f7b8e55',
          'border-width': 1,
          'text-wrap': 'wrap',
          'text-max-width': 64,
        },
      },
      {
        selector: 'node.active-state',
        style: {
          'background-color': '#f5a623',
          color: '#11151d',
          'font-weight': 700,
          'shadow-color': '#f5a623',
          'shadow-opacity': 0.45,
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': '#ffffff1f',
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#ffffff26',
          'arrow-scale': 0.8,
          opacity: 0.7,
        },
      },
      {
        selector: 'edge.rate-edge',
        style: {
          label: 'data(label)',
          'font-family': 'JetBrains Mono',
          'font-size': 8,
          color: '#8fa0b2',
          'text-background-color': '#0f1218',
          'text-background-opacity': 0.72,
          'text-background-padding': 2,
          'text-background-shape': 'round-rectangle',
          'text-rotation': 'autorotate',
          'text-margin-y': -4,
        },
      },
      {
        selector: 'edge.state-edge',
        style: {
          width: 1,
          'line-color': '#7e8ba455',
          'target-arrow-color': '#7e8ba455',
          'line-style': 'dashed',
          'line-dash-pattern': [3, 4],
          opacity: 0.75,
        },
      },
      {
        selector: 'edge.state-link',
        style: {
          width: 1.1,
          'line-color': '#f5a623aa',
          'target-arrow-color': '#f5a623aa',
          'line-style': 'dashed',
          'line-dash-pattern': [4, 3],
          opacity: 0.9,
        },
      },
      {
        selector: '.arb-edge',
        style: {
          width: 3,
          'line-color': '#3ddc84',
          'target-arrow-color': '#3ddc84',
          opacity: 1,
          'line-style': 'dashed',
          'line-dash-pattern': [12, 8],
          'z-index': 100,
        },
      },
      {
        selector: '.hovered-edge',
        style: {
          width: 2.4,
          'line-color': '#4d9fff',
          'target-arrow-color': '#4d9fff',
          opacity: 1,
        },
      },
      {
        selector: '.hovered-node',
        style: {
          'border-width': 2,
          'border-color': '#4d9fff',
        },
      },
      {
        selector: '.faded',
        style: {
          opacity: 0.12,
        },
      },
      {
        selector: '.states-hidden',
        style: {
          display: 'none',
        },
      },
    ];
  }

  _edgeId(a, b) {
    return `rate-${a}-${b}`;
  }

  _bindEvents() {
    this.cy.on('tap', 'node', (evt) => {
      this._focusNeighborhood(evt.target);
    });

    this.cy.on('tap', (evt) => {
      if (evt.target !== this.cy) return;
      const now = Date.now();
      if (now - this.lastTapTs < 280) {
        this.resetView();
      }
      this.lastTapTs = now;
    });

    this.cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();
      connectedEdges.addClass('hovered-edge');
      connectedNodes.addClass('hovered-node');
      node.addClass('hovered-node');
    });

    this.cy.on('mouseout', 'node', (evt) => {
      const node = evt.target;
      node.connectedEdges().removeClass('hovered-edge');
      this.cy.nodes().removeClass('hovered-node');
    });
  }

  _focusNeighborhood(node) {
    this.cy.elements().addClass('faded');
    node.removeClass('faded');
    node.connectedEdges().removeClass('faded');
    node.neighborhood().removeClass('faded');
  }

  _clearFocus() {
    this.cy.elements().removeClass('faded');
  }

  _tickArbDash() {
    if (this.disabled) return;
    this.dashOffset -= 0.7;
    const activeArb = this.cy.$('edge.arb-edge');
    if (activeArb.length) {
      activeArb.style('line-dash-offset', this.dashOffset);
    }
    requestAnimationFrame(() => this._tickArbDash());
  }

  _setStateVisibility() {
    const selector = this.cy.$('node.state-node, edge.state-edge, edge.state-link');
    if (this.showStates) selector.removeClass('states-hidden');
    else selector.addClass('states-hidden');
  }

  _setActiveState(opportunities, bfState) {
    this.cy.$('node.state-node').removeClass('active-state');

    let activeState = 'st-BF_RELAX';
    if (bfState?.hasNegCycle) activeState = 'st-NEG_CYCLE';
    else if (opportunities?.length) activeState = 'st-PQ_TOP';
    else if (this.showArb) activeState = 'st-BF_CHECK';

    const stateNode = this.cy.getElementById(activeState);
    if (stateNode.nonempty()) {
      stateNode.addClass('active-state');
    }

    this.cy.$('edge.state-link.dynamic-link').remove();

    if (!this.showStates || !opportunities?.length) return;
    const path = opportunities[0].path || [];
    const unique = Array.from(new Set(path));

    const links = unique
      .filter((ex) => EXCHANGES.includes(ex))
      .map((ex, idx) => ({
        data: {
          id: `dyn-${activeState}-${ex}-${idx}`,
          source: activeState,
          target: `ex-${ex}`,
          kind: 'state-link',
        },
        classes: 'state-link dynamic-link',
      }));

    if (links.length) this.cy.add(links);
  }

  update(prices, opportunities, bfState) {
    if (this.disabled) return;

    EXCHANGES.forEach((a) => {
      EXCHANGES.forEach((b) => {
        if (a === b) return;
        const edge = this.cy.getElementById(this._edgeId(a, b));
        if (edge.empty()) return;

        const rate = prices?.[a]?.[b];
        if (typeof rate === 'number') {
          edge.data('rate', rate);
          edge.data('label', this.showWeights ? rate.toFixed(4) : '');
        }
      });
    });

    this.cy.$('edge.rate-edge').removeClass('arb-edge');

    const nextArbPath = opportunities?.[0]?.path || [];
    this.lastArbPath = nextArbPath;

    if (this.showArb && nextArbPath.length > 1) {
      for (let i = 0; i < nextArbPath.length - 1; i += 1) {
        const from = nextArbPath[i];
        const to = nextArbPath[i + 1];
        const edge = this.cy.getElementById(this._edgeId(from, to));
        if (edge.nonempty()) edge.addClass('arb-edge');
      }
    }

    this._setActiveState(opportunities, bfState);
    this._setStateVisibility();
  }

  setShowWeights(show) {
    this.showWeights = !!show;
    this.cy.$('edge.rate-edge').forEach((edge) => {
      const rate = edge.data('rate');
      edge.data('label', this.showWeights && typeof rate === 'number' ? rate.toFixed(4) : '');
    });
  }

  setShowArb(show) {
    this.showArb = !!show;
    if (!show) {
      this.cy.$('edge.rate-edge').removeClass('arb-edge');
    }
  }

  toggleStates() {
    this.showStates = !this.showStates;
    this._setStateVisibility();
    return this.showStates;
  }

  relayout() {
    if (this.disabled) return;
    this._clearFocus();
    this.cy.layout({
      name: 'cose',
      animate: true,
      fit: true,
      padding: 36,
      animationDuration: 450,
      nodeRepulsion: 9000,
      edgeElasticity: 80,
    }).run();
  }

  fitActiveCycle() {
    if (this.disabled) return;
    const cycleEdges = this.cy.$('edge.arb-edge');
    if (cycleEdges.nonempty()) {
      const cycleNodes = cycleEdges.connectedNodes();
      this.cy.fit(cycleEdges.union(cycleNodes), 55);
      return;
    }
    this.cy.fit(this.cy.elements(':visible'), 40);
  }

  resetView() {
    if (this.disabled) return;
    this._clearFocus();
    this.cy.fit(this.cy.elements(':visible'), 40);
    this.cy.zoom(1);
    this.cy.center();
  }
}

window.netGraph = new CytoscapeGraph('netGraph');

let _showArb = true;
let _showWeights = false;

window.toggleArbHighlight = function toggleArbHighlight() {
  _showArb = !_showArb;
  window.netGraph.setShowArb(_showArb);
  const btn = document.getElementById('btn-show-arb');
  if (btn) btn.classList.toggle('active', _showArb);
};

window.toggleWeights = function toggleWeights() {
  _showWeights = !_showWeights;
  window.netGraph.setShowWeights(_showWeights);
  const btn = document.getElementById('btn-show-weights');
  if (btn) btn.classList.toggle('active', _showWeights);
};

window.graphResetView = function graphResetView() {
  window.netGraph.resetView();
};

window.graphRelayout = function graphRelayout() {
  window.netGraph.relayout();
};

window.graphFitCycle = function graphFitCycle() {
  window.netGraph.fitActiveCycle();
};

window.toggleStateNodes = function toggleStateNodes() {
  const visible = window.netGraph.toggleStates();
  const btn = document.getElementById('btn-toggle-states');
  if (btn) btn.classList.toggle('active', visible);
};
