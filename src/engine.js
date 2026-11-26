// Emu_Retro_Football rules engine.
// Pure state machine: no DOM, no timers, no audio. Time enters through advance(ms),
// randomness through the injected rng, and sound leaves as named events.

import { TUNING } from './tuning.js?v=9';

export const COLS = 9;
export const ROWS = 4;

const other = (team) => (team === 'home' ? 'visitor' : 'home');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const same = (a, b) => a && b && a.c === b.c && a.r === b.r;
const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

export class Game {
  constructor({ rng = Math.random, tuning = TUNING } = {}) {
    this.rng = rng;
    this.tuning = tuning;
    this.events = [];
    this.phase = 'off';
    this.skill = 1;
    this.selector = 'run';
    this.play = null;
  }

  // ---------- power, switches ----------

  // 0 = OFF, 1 = beginner, 2 = pro.
  setSkill(n) {
    if (n === 0) {
      this.phase = 'off';
      this.play = null;
      this.events = [];
      return;
    }
    const wasOff = this.phase === 'off';
    this.skill = n;
    if (wasOff) this.powerOn();
    else if (this.phase === 'ready') this.setupPlay();
  }

  powerOn() {
    this.score = { home: 0, visitor: 0 };
    this.quarter = 1;
    this.clock = 150; // tenths of a simulated minute
    this.offense = 'home';
    this.ball = 20; // yards from the offense's own goal line
    this.down = 1;
    this.ytg = 10;
    this.runback = false;
    this.displayMode = 'field';
    this.statusToggle = 0;
    this.resetOnRelease = false;
    this.clockAcc = 0;
    this.defAcc = 0;
    this.animAcc = 0;
    this.phase = 'ready';
    this.setupPlay();
  }

  setSelector(sel) {
    this.selector = sel === 'pass' ? 'pass' : 'run';
    if (this.phase === 'ready' && !this.runback) this.setupPlay();
  }

  // ---------- play setup ----------

  setupPlay() {
    const type = this.runback ? 'runback' : this.selector;
    const pass = type === 'pass';
    const backRow = () => (pass ? 1 : this.rng() < 0.5 ? 1 : 2);
    const defenders = [
      { c: 3, r: 1, role: 'rush' },
      { c: 3, r: 2, role: 'rush' },
      { c: 4, r: 0, role: 'rush' },
      { c: 4, r: 3, role: 'rush' },
      { c: 6, r: backRow(), role: 'pd' },
      { c: 8, r: backRow(), role: 'pd' },
    ];
    if (this.skill === 2) defenders.push({ c: 5, r: this.rng() < 0.5 ? 1 : 2, role: 'rush' });
    for (const d of defenders) d.alive = true;

    this.play = {
      type,
      mirror: this.offense === 'visitor',
      defenders,
      moves: 0, // forward yards credited to the ball carrier on this play
      thrown: false,
      flight: null,
      kickBall: null,
      deadCell: null,
      qb: pass ? { c: 0, r: 1 } : null,
      carrier: pass ? null : { c: 0, r: 1 },
      receiver: pass ? { c: 1, r: 2 } : null,
      // Run: two blockers held at fixed offsets from the carrier. Pass: one fixed blocker.
      blockers: pass
        ? [{ c: 1, r: 1, alive: true }]
        : [
            { dc: 1, dr: -1, alive: true },
            { dc: 1, dr: 1, alive: true },
          ],
    };
    this.defAcc = 0;
    this.animAcc = 0;
  }

  blockerCells() {
    const p = this.play;
    const out = [];
    for (const b of p.blockers) {
      if (!b.alive) continue;
      if (p.type === 'pass') {
        out.push({ c: b.c, r: b.r, ref: b });
      } else {
        const c = (p.carrier.c + b.dc) % COLS;
        const r = p.carrier.r + b.dr;
        if (inGrid(c, r)) out.push({ c, r, ref: b });
      }
    }
    return out;
  }

  preThrow() {
    return this.play.type === 'pass' && !this.play.thrown;
  }

  ballHolder() {
    return this.preThrow() ? this.play.qb : this.play.carrier;
  }

  defenderAt(c, r) {
    return this.play.defenders.find((d) => d.alive && d.c === c && d.r === r);
  }

  // ---------- player input ----------

  // dir: 'up' | 'down' | 'fwd'
  move(dir) {
    if (this.phase === 'ready') this.phase = 'live';
    if (this.phase !== 'live') return;
    const p = this.play;
    const dc = dir === 'fwd' ? 1 : 0;
    const dr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;

    if (this.preThrow()) {
      // Only the receiver moves. He cannot be tackled and cannot enter an occupied cell.
      const c = p.receiver.c + dc;
      const r = p.receiver.r + dr;
      if (!inGrid(c, r)) return;
      const blocked =
        same({ c, r }, p.qb) || this.blockerCells().some((b) => b.c === c && b.r === r) || this.defenderAt(c, r);
      if (!blocked) p.receiver = { c, r };
      return;
    }

    const car = p.carrier;
    const r = car.r + dr;
    if (r < 0 || r >= ROWS) return;
    car.r = r;
    if (dc) {
      car.c = (car.c + 1) % COLS; // the 9-yard window wraps
      p.moves += 1;
    }
    this.resolveOffenseContact();
    if (this.phase === 'live' && this.ball + p.moves - 2 >= 100) this.touchdown();
  }

  resolveOffenseContact() {
    const p = this.play;
    for (const b of this.blockerCells()) {
      const d = this.defenderAt(b.c, b.r);
      if (d) {
        d.alive = false;
        b.ref.alive = false;
      }
    }
    if (this.defenderAt(p.carrier.c, p.carrier.r)) this.tackle();
  }

  // The single KICK/PASS key.
  kickPass() {
    const p = this.play;
    if (this.phase !== 'ready' && this.phase !== 'live') return;
    if (p.type === 'pass') {
      if (!p.thrown) this.throwPass();
      return;
    }
    if (p.type === 'run' && this.phase === 'ready' && this.down === 4) {
      this.phase = 'kick';
      p.kickBall = { c: 0, r: 1 };
      this.animAcc = 0;
      this.events.push('kick');
    }
  }

  throwPass() {
    const p = this.play;
    p.thrown = true;
    // The ball flies along the quarterback's row. Only the receiver and the two
    // pass defenders can catch it; the nearest one in line gets it.
    let result = 'incomplete';
    let target = COLS - 1;
    let who = null;
    for (let c = 1; c < COLS; c++) {
      if (p.receiver.c === c && p.receiver.r === p.qb.r) {
        result = 'complete';
        target = c;
        break;
      }
      const d = this.defenderAt(c, p.qb.r);
      if (d && d.role === 'pd') {
        result = 'intercept';
        target = c;
        who = d;
        break;
      }
    }
    p.flight = { c: 1, r: p.qb.r, target, result, who };
    this.phase = 'flight';
    this.animAcc = 0;
  }

  resolveFlight() {
    const p = this.play;
    const f = p.flight;
    p.flight = null;
    if (f.result === 'complete') {
      // The receiver becomes the runner; quarterback and blocker leave the field.
      p.carrier = { ...p.receiver };
      p.moves = p.carrier.c;
      p.receiver = null;
      p.blockers = [];
      const qbCell = p.qb;
      p.qb = null;
      p.qbCell = qbCell;
      this.phase = 'live';
      this.events.push('catch');
      if (this.ball + p.moves - 2 >= 100) this.touchdown();
    } else if (f.result === 'intercept') {
      p.deadCell = { c: f.who.c, r: f.who.r };
      const spot = 100 - (this.ball + f.who.c - 2);
      this.turnover(spot <= 0 ? 20 : spot);
      this.endPlay();
    } else {
      p.deadCell = { ...p.qb };
      this.loseDown(0);
      this.endPlay();
    }
  }

  // ---------- defense ----------

  defenderTick() {
    const p = this.play;
    const order = p.defenders.filter((d) => d.alive);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const d of order) {
      if (this.phase !== 'live') return;
      if (!d.alive) continue;
      const guarding = this.preThrow() && d.role === 'pd';
      const prob = guarding
        ? this.tuning.passDefenderMoveProb[this.skill]
        : this.tuning.defenderMoveProb[this.skill];
      if (this.rng() >= prob) continue;
      this.stepDefender(d, guarding ? this.guardTarget(d) : this.ballHolder());
    }
  }

  // Where a pass defender wants to stand before the throw: in the quarterback's row,
  // on the goal-line side of the receiver. They trail him; they never step in front.
  guardTarget(d) {
    const p = this.play;
    const deep = p.defenders.filter((x) => x.alive && x.role === 'pd').sort((a, b) => a.c - b.c);
    const depth = deep[0] === d ? 1 : 3;
    return { c: clamp(p.receiver.c + depth, 2, COLS - 1), r: p.qb.r };
  }

  stepDefender(d, target) {
    const p = this.play;
    const dx = sign(target.c - d.c);
    const dy = sign(target.r - d.r);
    if (!dx && !dy) return;
    const cands = [[dx, dy]];
    if (dx && dy) cands.push([dx, 0], [0, dy]);
    else if (dx) cands.push([dx, -1], [dx, 1]);
    else cands.push([-1, dy], [1, dy]);

    const pre = this.preThrow();
    for (const [mx, my] of cands) {
      const c = d.c + mx;
      const r = d.r + my;
      if (!inGrid(c, r)) continue;
      if (this.defenderAt(c, r)) continue;
      if (pre && same({ c, r }, p.receiver)) continue; // the receiver cannot be tackled
      const blocker = this.blockerCells().find((b) => b.c === c && b.r === r);
      if (blocker) {
        // Tackler and blocker hit: both leave the field.
        d.alive = false;
        blocker.ref.alive = false;
        return;
      }
      d.c = c;
      d.r = r;
      if (same(d, this.ballHolder())) {
        if (pre) this.sack();
        else this.tackle();
      }
      return;
    }
  }

  // ---------- play results ----------

  tackle() {
    const p = this.play;
    p.deadCell = { ...p.carrier };
    const gain = p.moves - 2; // first two forward yards only cancel the built-in loss
    if (p.type === 'runback') {
      this.ball = clamp(this.ball + gain, 1, 99);
      this.runback = false;
      this.firstDown();
      this.events.push('whistle');
    } else {
      this.applyGain(gain);
    }
    this.endPlay();
  }

  sack() {
    const p = this.play;
    p.deadCell = { ...p.qb };
    this.applyGain(-2);
    this.endPlay();
  }

  applyGain(gain) {
    const spot = this.ball + gain;
    if (spot <= 0) {
      this.safety();
      return;
    }
    this.ball = spot;
    if (gain >= this.ytg) {
      this.firstDown();
      this.events.push('whistle');
    } else {
      this.loseDown(gain);
    }
  }

  loseDown(gain) {
    this.ytg -= gain;
    this.down += 1;
    if (this.down > 4) this.turnover(100 - this.ball);
    else this.events.push('whistle');
  }

  firstDown() {
    this.down = 1;
    this.ytg = Math.min(10, 100 - this.ball);
  }

  turnover(newBall) {
    this.offense = other(this.offense);
    this.ball = clamp(newBall, 1, 99);
    this.firstDown();
    this.events.push('turnover');
  }

  touchdown() {
    const p = this.play;
    p.deadCell = { ...p.carrier };
    this.score[this.offense] += 7;
    this.events.push('score');
    this.kickoff(other(this.offense));
    this.endPlay();
  }

  safety() {
    // Two points to the opponent, who also take the ball first-and-ten at their 20.
    const scorer = other(this.offense);
    this.score[scorer] += 2;
    this.events.push('score');
    this.offense = scorer;
    this.ball = 20;
    this.runback = false;
    this.firstDown();
  }

  kickoff(receiver) {
    this.offense = receiver;
    if (this.rng() < this.tuning.shortKickoffChance) {
      this.runback = true;
      this.ball = this.tuning.runbackStartYard;
    } else {
      this.runback = false;
      this.ball = 20;
    }
    this.firstDown();
  }

  resolveKick() {
    const p = this.play;
    p.kickBall = null;
    const { sureYards, maxYards, maxProb } = this.tuning.fieldGoal;
    const dist = 100 - this.ball;
    const prob =
      dist <= sureYards ? maxProb : dist >= maxYards ? 0 : (maxProb * (maxYards - dist)) / (maxYards - sureYards);
    if (this.rng() < prob) {
      this.score[this.offense] += 3;
      this.events.push('score');
      this.kickoff(other(this.offense));
    } else {
      // A missed field goal is automatically a punt.
      const { min, max } = this.tuning.punt;
      const landing = this.ball + Math.round(min + this.rng() * (max - min));
      this.turnover(landing >= 100 ? 20 : 100 - landing);
    }
    this.endPlay();
  }

  endPlay() {
    this.statusToggle = 0;
    if (this.clock <= 0) {
      this.phase = this.quarter >= 4 ? 'gameOver' : 'quarterEnd';
    } else {
      this.phase = 'dead';
    }
  }

  startNextQuarter() {
    this.quarter += 1;
    this.clock = 150;
    this.clockAcc = 0;
    if (this.quarter === 3) {
      // Second half: visitors receive at their own 20.
      this.offense = 'visitor';
      this.ball = 20;
      this.runback = false;
      this.firstDown();
    }
  }

  // ---------- DISPLAY key ----------

  pressDisplay() {
    switch (this.phase) {
      case 'dead':
        this.displayMode = 'status1';
        this.statusToggle = 1;
        this.resetOnRelease = true;
        break;
      case 'quarterEnd':
        this.startNextQuarter();
        this.phase = 'dead';
        this.displayMode = 'status1';
        this.statusToggle = 1;
        this.resetOnRelease = true;
        break;
      case 'ready':
        this.displayMode = this.statusToggle === 0 ? 'status1' : 'status2';
        this.statusToggle ^= 1;
        break;
      default:
        break;
    }
  }

  releaseDisplay() {
    if (this.phase === 'off') return;
    this.displayMode = 'field';
    if (this.resetOnRelease) {
      this.resetOnRelease = false;
      this.setupPlay();
      this.phase = 'ready';
    }
  }

  // ---------- time ----------

  advance(ms) {
    if (this.phase === 'live') {
      this.clockAcc += ms;
      while (this.clockAcc >= this.tuning.msPerClockTenth) {
        this.clockAcc -= this.tuning.msPerClockTenth;
        if (this.clock > 0) {
          this.clock -= 1;
          this.events.push('tick');
        }
      }
      this.defAcc += ms;
      const interval = this.tuning.defenderIntervalMs[this.skill];
      while (this.defAcc >= interval && this.phase === 'live') {
        this.defAcc -= interval;
        this.defenderTick();
      }
    } else if (this.phase === 'flight') {
      this.animAcc += ms;
      const f = this.play.flight;
      while (this.animAcc >= this.tuning.flightStepMs && this.phase === 'flight') {
        this.animAcc -= this.tuning.flightStepMs;
        if (f.c >= f.target) this.resolveFlight();
        else f.c += 1;
      }
    } else if (this.phase === 'kick') {
      this.animAcc += ms;
      const k = this.play.kickBall;
      while (this.animAcc >= this.tuning.kickStepMs && this.phase === 'kick') {
        this.animAcc -= this.tuning.kickStepMs;
        if (k.c >= COLS - 1) this.resolveKick();
        else k.c += 1;
      }
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- what the nine-digit display shows ----------

  statusDigits(which) {
    const blank = { ch: ' ', dp: false };
    const d = Array.from({ length: COLS }, () => ({ ...blank }));
    const put = (i, ch, dp = false) => {
      d[i] = { ch: String(ch), dp };
    };
    if (which === 'status1') {
      // DOWN | YARDS TO GO | u/d + FIELD POSITION, e.g. "3  9 u 25"
      put(0, this.down);
      const ytg = clamp(this.ytg, 0, 99);
      if (ytg >= 10) put(2, Math.floor(ytg / 10));
      put(3, ytg % 10);
      const own = this.ball < 50;
      const pos = own ? this.ball : 100 - this.ball;
      put(5, own ? 'u' : 'd');
      if (pos >= 10) put(7, Math.floor(pos / 10));
      put(8, pos % 10);
    } else {
      // HOME | TIME REMAINING | VISITOR, e.g. "14 11.9 07"
      const h = this.score.home % 100;
      const v = this.score.visitor % 100;
      put(0, Math.floor(h / 10));
      put(1, h % 10);
      put(3, Math.floor(this.clock / 100));
      put(4, Math.floor(this.clock / 10) % 10, true);
      put(5, this.clock % 10);
      put(7, Math.floor(v / 10));
      put(8, v % 10);
    }
    return d;
  }

  view() {
    if (this.phase === 'off') return { mode: 'off' };
    if (this.phase === 'quarterEnd' || this.phase === 'gameOver') {
      return { mode: 'status', digits: this.statusDigits('status2') };
    }
    if (this.displayMode !== 'field') {
      return { mode: 'status', digits: this.statusDigits(this.displayMode) };
    }
    const p = this.play;
    const cells = [];
    const add = (cell, level, blink = false) => {
      if (!cell) return;
      cells.push({ c: p.mirror ? COLS - 1 - cell.c : cell.c, r: cell.r, level, blink });
    };
    if (this.phase === 'dead') {
      // Play over: only the ball carrier remains, blinking at the spot.
      add(p.deadCell, 'bright', true);
      return { mode: 'field', cells };
    }
    for (const d of p.defenders) if (d.alive) add(d, 'dim');
    for (const b of this.blockerCells()) add(b, 'bright');
    if (p.type === 'pass' && !p.thrown) {
      add(p.qb, 'bright', true);
      add(p.receiver, 'bright');
    } else if (this.phase === 'flight') {
      add(p.qb, 'bright');
      add(p.receiver, 'bright');
      add(p.flight, 'bright', true);
    } else if (this.phase === 'kick') {
      add(p.kickBall, 'bright', true);
    } else {
      add(p.carrier, 'bright', true);
    }
    return { mode: 'field', cells };
  }
}
