'use strict';

const FW_NODES = ['A', 'B', 'C', 'D'];
const INF = Number.POSITIVE_INFINITY;
const INITIAL_MATRIX = [
  [0, 3, 8, INF],
  [INF, 0, 2, 5],
  [INF, INF, 0, 1],
  [2, INF, INF, 0],
];

const NODE_POSITIONS = {
  A: { x: 110, y: 88 },
  B: { x: 408, y: 88 },
  C: { x: 110, y: 294 },
  D: { x: 408, y: 294 },
};

const EDGE_LABEL_OFFSETS = {
  'A-B': { x: 0, y: -16 },
  'A-C': { x: -22, y: 0 },
  'A-D': { x: 0, y: -14 },
  'B-C': { x: 0, y: 16 },
  'B-D': { x: 22, y: 0 },
  'C-D': { x: 0, y: -16 },
};

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function formatValue(value) {
  if (value === INF) return '∞';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, '');
}

function formatArithmetic(value) {
  return value === INF ? '∞' : formatValue(value);
}

function buildSteps() {
  const working = cloneMatrix(INITIAL_MATRIX);
  const steps = [
    {
      type: 'initial',
      matrix: cloneMatrix(working),
      explanation:
        'Initial teaching matrix loaded. This example is chosen to produce visible relaxations while the simulator evaluates every combination of k, i, and j.',
      displayStep: 0,
      k: null,
      i: null,
      j: null,
      changed: false,
      currentCell: null,
      viaCells: [],
    },
  ];

  for (let k = 0; k < FW_NODES.length; k += 1) {
    for (let i = 0; i < FW_NODES.length; i += 1) {
      for (let j = 0; j < FW_NODES.length; j += 1) {
        const direct = working[i][j];
        const left = working[i][k];
        const right = working[k][j];
        const via = left === INF || right === INF ? INF : left + right;
        const updated = via < direct ? via : direct;
        const changed = updated !== direct;

        if (changed) {
          working[i][j] = updated;
        }

        steps.push({
          type: 'evaluation',
          matrix: cloneMatrix(working),
          displayStep: steps.length,
          k,
          i,
          j,
          left,
          right,
          direct,
          via,
          after: updated,
          changed,
          currentCell: [i, j],
          viaCells: [
            [i, k],
            [k, j],
          ],
          explanation: buildExplanation({ k, i, j, left, right, direct, via, updated, changed }),
        });
      }
    }
  }

  return steps;
}

function buildExplanation({ k, i, j, left, right, direct, via, updated, changed }) {
  const kNode = FW_NODES[k];
  const iNode = FW_NODES[i];
  const jNode = FW_NODES[j];

  return `k=${k} (Node ${kNode}). Checking if path from ${iNode} to ${jNode} is shorter via ${kNode}. min(dist[${iNode}][${jNode}], dist[${iNode}][${kNode}] + dist[${kNode}][${jNode}]) -> min(${formatArithmetic(direct)}, ${formatArithmetic(left)} + ${formatArithmetic(right)}) = ${formatArithmetic(updated)}. ${changed ? `Update applied: dist[${iNode}][${jNode}] changes from ${formatArithmetic(direct)} to ${formatArithmetic(updated)}.` : 'No change.'}`;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

class FloydWarshallSimulator {
  constructor() {
    this.steps = buildSteps();
    this.currentStepIndex = 0;
    this.playTimer = null;
    this.matrixTable = document.getElementById('matrix-table');
    this.graphSvg = document.getElementById('fw-graph');
    this.statusBox = document.getElementById('status-box');
    this.stepIndicator = document.getElementById('step-indicator');
    this.loopIndicator = document.getElementById('loop-indicator');
    this.progressCount = document.getElementById('progress-count');
    this.progressFill = document.getElementById('progress-fill');
    this.prevButton = document.getElementById('prev-step');
    this.nextButton = document.getElementById('next-step');
    this.playPauseButton = document.getElementById('play-pause');
    this.resetButton = document.getElementById('reset-steps');
    this.nodeRefs = {};
    this.edgeRefs = {};

    this.bindEvents();
    this.renderGraph();
    this.renderCurrentStep();
  }

  bindEvents() {
    this.prevButton.addEventListener('click', () => this.prevStep());
    this.nextButton.addEventListener('click', () => this.nextStep());
    this.playPauseButton.addEventListener('click', () => this.togglePlayback());
    this.resetButton.addEventListener('click', () => this.reset());
  }

  renderCurrentStep() {
    const step = this.steps[this.currentStepIndex];
    this.renderMatrix(step);
    this.renderStatus(step);
    this.renderIndicators(step);
    this.renderGraphHighlights(step);
    this.updateControls();
  }

  renderMatrix(step) {
    const table = this.matrixTable;
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = '';
    headRow.appendChild(corner);

    FW_NODES.forEach((node) => {
      const th = document.createElement('th');
      th.textContent = node;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    step.matrix.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      const rowLabel = document.createElement('th');
      rowLabel.textContent = FW_NODES[rowIndex];
      tr.appendChild(rowLabel);

      row.forEach((value, columnIndex) => {
        const td = document.createElement('td');
        td.textContent = formatValue(value);

        if (rowIndex === columnIndex) {
          td.classList.add('diagonal');
        }

        if (step.currentCell && rowIndex === step.currentCell[0] && columnIndex === step.currentCell[1]) {
          td.classList.add('cell-current');
        }

        const isViaCell = step.viaCells.some(([viaRow, viaColumn]) => viaRow === rowIndex && viaColumn === columnIndex);
        if (isViaCell) {
          td.classList.add('cell-via');
        }

        if (step.changed && step.currentCell && rowIndex === step.currentCell[0] && columnIndex === step.currentCell[1]) {
          td.classList.add('cell-updated');
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
  }

  renderStatus(step) {
    if (step.type === 'initial') {
      this.statusBox.innerHTML = `<strong>Initial State.</strong> ${step.explanation}`;
      return;
    }

    this.statusBox.innerHTML = `
      <strong>Current Evaluation.</strong>
      ${step.explanation}
    `;
  }

  renderIndicators(step) {
    if (step.type === 'initial') {
      this.stepIndicator.textContent = 'Initial State';
      this.loopIndicator.textContent = 'k = -, i = -, j = -';
    } else {
      this.stepIndicator.textContent = `Step ${step.displayStep} of ${this.steps.length - 1}`;
      this.loopIndicator.textContent = `k = ${step.k}, i = ${step.i}, j = ${step.j}`;
    }

    this.progressCount.textContent = `Step ${step.displayStep} / ${this.steps.length - 1}`;
    const progress = (step.displayStep / (this.steps.length - 1)) * 100;
    this.progressFill.style.width = `${progress}%`;
  }

  renderGraph() {
    const svg = this.graphSvg;
    svg.innerHTML = '';

    const defs = createSvgElement('defs');
    const marker = createSvgElement('marker', {
      id: 'fw-arrow',
      viewBox: '0 0 12 12',
      refX: '10',
      refY: '6',
      markerWidth: '10',
      markerHeight: '10',
      orient: 'auto-start-reverse',
    });
    marker.appendChild(createSvgElement('path', { d: 'M 0 0 L 12 6 L 0 12 z', fill: 'rgba(159, 179, 201, 0.92)' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const edgeLayer = createSvgElement('g');
    const nodeLayer = createSvgElement('g');

    for (let i = 0; i < FW_NODES.length; i += 1) {
      for (let j = 0; j < FW_NODES.length; j += 1) {
        if (i === j || INITIAL_MATRIX[i][j] === INF) continue;
        const from = FW_NODES[i];
        const to = FW_NODES[j];
        const edgeKey = `${from}-${to}`;
        const edgeGroup = this.createEdgeGroup(from, to, INITIAL_MATRIX[i][j]);
        this.edgeRefs[edgeKey] = edgeGroup;
        edgeLayer.appendChild(edgeGroup.group);
      }
    }

    FW_NODES.forEach((node) => {
      const nodeGroup = createSvgElement('g', { class: 'graph-node', 'data-node': node });
      const { x, y } = NODE_POSITIONS[node];
      const circle = createSvgElement('circle', { cx: x, cy: y, r: 30 });
      const label = createSvgElement('text', { x, y });
      label.textContent = node;
      nodeGroup.appendChild(circle);
      nodeGroup.appendChild(label);
      this.nodeRefs[node] = nodeGroup;
      nodeLayer.appendChild(nodeGroup);
    });

    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
  }

  createEdgeGroup(from, to, weight) {
    const start = NODE_POSITIONS[from];
    const end = NODE_POSITIONS[to];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    const unitX = dx / distance;
    const unitY = dy / distance;
    const startX = start.x + unitX * 34;
    const startY = start.y + unitY * 34;
    const endX = end.x - unitX * 38;
    const endY = end.y - unitY * 38;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const offset = EDGE_LABEL_OFFSETS[`${from}-${to}`] || { x: 0, y: 0 };

    const group = createSvgElement('g', { 'data-edge': `${from}-${to}` });
    const line = createSvgElement('line', {
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      class: 'graph-edge',
      'marker-end': 'url(#fw-arrow)',
    });
    const labelGroup = createSvgElement('g');
    const labelBackground = createSvgElement('rect', {
      x: midX - 18 + offset.x,
      y: midY - 11 + offset.y,
      width: 36,
      height: 22,
      rx: 11,
      class: 'edge-label-bg',
    });
    const label = createSvgElement('text', {
      x: midX + offset.x,
      y: midY + 1 + offset.y,
      class: 'edge-label',
    });
    label.textContent = formatValue(weight);
    labelGroup.appendChild(labelBackground);
    labelGroup.appendChild(label);
    group.appendChild(line);
    group.appendChild(labelGroup);

    return { group, line };
  }

  renderGraphHighlights(step) {
    Object.values(this.nodeRefs).forEach((node) => {
      node.classList.remove('active-i', 'active-j', 'active-k', 'active-all');
    });

    Object.values(this.edgeRefs).forEach((edge) => {
      edge.line.classList.remove('is-current', 'is-candidate', 'is-updated');
    });

    if (step.type === 'initial') {
      return;
    }

    const iNode = FW_NODES[step.i];
    const jNode = FW_NODES[step.j];
    const kNode = FW_NODES[step.k];

    this.applyNodeState(iNode, 'active-i');
    this.applyNodeState(jNode, 'active-j');
    this.applyNodeState(kNode, 'active-k');

    if (iNode === jNode && jNode === kNode) {
      this.nodeRefs[iNode].classList.add('active-all');
    }

    const currentEdge = this.edgeRefs[`${iNode}-${jNode}`];
    if (currentEdge) {
      currentEdge.line.classList.add(step.changed ? 'is-updated' : 'is-current');
    }

    const firstCandidate = this.edgeRefs[`${iNode}-${kNode}`];
    const secondCandidate = this.edgeRefs[`${kNode}-${jNode}`];

    if (firstCandidate) {
      firstCandidate.line.classList.add('is-candidate');
    }
    if (secondCandidate) {
      secondCandidate.line.classList.add('is-candidate');
    }

    if (step.changed && currentEdge) {
      currentEdge.line.classList.add('is-updated');
    }
  }

  applyNodeState(nodeName, className) {
    const node = this.nodeRefs[nodeName];
    if (!node) return;
    node.classList.add(className);
    const activeClasses = ['active-i', 'active-j', 'active-k'];
    const count = activeClasses.filter((activeClass) => node.classList.contains(activeClass)).length;
    if (count > 1) {
      node.classList.add('active-all');
    }
  }

  updateControls() {
    const atStart = this.currentStepIndex === 0;
    const atEnd = this.currentStepIndex === this.steps.length - 1;
    this.prevButton.disabled = atStart;
    this.nextButton.disabled = atEnd;
    this.playPauseButton.textContent = this.playTimer ? 'Pause' : 'Play';
  }

  nextStep() {
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.stopPlayback();
      return;
    }
    this.currentStepIndex += 1;
    this.renderCurrentStep();
  }

  prevStep() {
    if (this.currentStepIndex <= 0) return;
    this.currentStepIndex -= 1;
    this.renderCurrentStep();
  }

  togglePlayback() {
    if (this.playTimer) {
      this.stopPlayback();
      return;
    }

    if (this.currentStepIndex >= this.steps.length - 1) {
      this.currentStepIndex = 0;
      this.renderCurrentStep();
    }

    this.playTimer = window.setInterval(() => {
      if (this.currentStepIndex >= this.steps.length - 1) {
        this.stopPlayback();
        return;
      }
      this.nextStep();
    }, 1200);

    this.updateControls();
  }

  stopPlayback() {
    if (!this.playTimer) return;
    window.clearInterval(this.playTimer);
    this.playTimer = null;
    this.updateControls();
  }

  reset() {
    this.stopPlayback();
    this.currentStepIndex = 0;
    this.renderCurrentStep();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.floydWarshallSimulator = new FloydWarshallSimulator();
});
