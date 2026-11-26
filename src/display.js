// Nine-digit LED display. Each column is one seven-segment digit plus two extra
// bars below it. The four player rows are the digit's top bar, its bottom bar and
// the two extra bars, so the field and the numbers share the same lights.

import { COLS } from './engine.js';

const NS = 'http://www.w3.org/2000/svg';
const COL_W = 100;
const END_W = 46;
const HEIGHT = 300;
// y centres of the four field rows: segment a, segment d, bar 1, bar 2
const ROW_Y = [66, 120, 174, 228];
const MID_Y = 93;
const X0 = 30;
const X1 = 70;

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  u: 'cde', d: 'bcdeg', ' ': '',
};

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export class Display {
  constructor(svg) {
    this.svg = svg;
    this.cols = [];
    const width = COLS * COL_W + END_W * 2;
    svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);

    const defs = el('defs', {}, svg);
    const hatch = el('pattern', { id: 'hatch', width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' }, defs);
    el('rect', { width: 14, height: 14, class: 'endzone-bg' }, hatch);
    el('rect', { width: 5, height: 14, class: 'endzone-stripe' }, hatch);

    el('rect', { x: 0, y: 0, width, height: HEIGHT, class: 'glass' }, svg);
    el('rect', { x: 0, y: 0, width: END_W, height: HEIGHT, fill: 'url(#hatch)' }, svg);
    el('rect', { x: width - END_W, y: 0, width: END_W, height: HEIGHT, fill: 'url(#hatch)' }, svg);

    // yard lines with hash marks
    for (let i = 0; i <= COLS; i++) {
      const x = END_W + i * COL_W;
      el('line', { x1: x, y1: 0, x2: x, y2: HEIGHT, class: 'yardline' }, svg);
      for (const y of [100, 200]) el('line', { x1: x - 7, y1: y, x2: x + 7, y2: y, class: 'yardline' }, svg);
    }

    for (let c = 0; c < COLS; c++) {
      const g = el('g', { transform: `translate(${END_W + c * COL_W} 0)` }, svg);
      const seg = {};
      const bar = (y) => el('rect', { x: X0 + 3, y: y - 5, width: X1 - X0 - 6, height: 10, rx: 5, class: 'seg' }, g);
      const post = (x, yTop, yBot) => el('rect', { x: x - 5, y: yTop + 4, width: 10, height: yBot - yTop - 8, rx: 5, class: 'seg' }, g);
      seg.a = bar(ROW_Y[0]);
      seg.g = bar(MID_Y);
      seg.d = bar(ROW_Y[1]);
      seg.f = post(X0, ROW_Y[0], MID_Y);
      seg.b = post(X1, ROW_Y[0], MID_Y);
      seg.e = post(X0, MID_Y, ROW_Y[1]);
      seg.c = post(X1, MID_Y, ROW_Y[1]);
      seg.dp = el('circle', { cx: X1 + 15, cy: ROW_Y[1], r: 5.5, class: 'seg' }, g);
      seg.bar1 = bar(ROW_Y[2]);
      seg.bar2 = bar(ROW_Y[3]);
      this.cols.push(seg);
    }
    this.rowSeg = ['a', 'd', 'bar1', 'bar2'];
  }

  // view comes from Game.view(); blinkOn is the shared blink phase.
  render(view, blinkOn) {
    const levels = this.cols.map(() => ({}));
    if (view.mode === 'field') {
      for (const cell of view.cells) {
        if (cell.blink && !blinkOn) continue;
        const key = this.rowSeg[cell.r];
        // a bright mark wins over a dim one sharing the cell
        if (levels[cell.c][key] !== 'on') levels[cell.c][key] = cell.level === 'bright' ? 'on' : 'dim';
      }
    } else if (view.mode === 'status') {
      view.digits.forEach((d, c) => {
        for (const s of SEGMENTS[d.ch] ?? '') levels[c][s] = 'on';
        if (d.dp) levels[c].dp = 'on';
      });
    }
    this.cols.forEach((seg, c) => {
      for (const key of Object.keys(seg)) {
        const cls = 'seg' + (levels[c][key] ? ' ' + levels[c][key] : '');
        if (seg[key].getAttribute('class') !== cls) seg[key].setAttribute('class', cls);
      }
    });
    this.svg.classList.toggle('powered', view.mode !== 'off');
  }
}
