import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { TUNING } from '../src/tuning.js';

// rng that never triggers short kickoffs or made field goals unless a test overrides it
const newGame = (rng = () => 0.99, skill = 1) => {
  const g = new Game({ rng });
  g.setSkill(skill);
  return g;
};
const clearDefense = (g) => g.play.defenders.forEach((d) => (d.alive = false));
const placeTackler = (g, c, r) => g.play.defenders.push({ c, r, role: 'rush', alive: true });
const nextDown = (g) => {
  g.pressDisplay();
  g.releaseDisplay();
};
const text = (digits) => digits.map((d) => d.ch + (d.dp ? '.' : '')).join('');
// Run n yards forward with no defense, then get tackled by a tackler dropped in the way.
const runFor = (g, n) => {
  clearDefense(g);
  for (let i = 0; i < n; i++) g.move('fwd');
  const car = g.play.carrier;
  placeTackler(g, car.c, car.r === 0 ? 1 : car.r - 1);
  g.move(car.r === 0 ? 'down' : 'up');
};

test('game opens with home first-and-ten at its own 20, 15.0 on the clock', () => {
  const g = newGame();
  assert.equal(text(g.statusDigits('status1')), '1 10 u 20');
  assert.equal(text(g.statusDigits('status2')), '00 15.0 00');
  assert.equal(g.play.defenders.length, 6);
});

test('pro skill fields seven defenders and moves them faster', () => {
  const g = newGame(() => 0.99, 2);
  assert.equal(g.play.defenders.length, 7);
  assert.ok(TUNING.defenderIntervalMs[2] < TUNING.defenderIntervalMs[1]);
});

test('yardage: tackled after 0, 1, 2, 3 forward moves gives -2, -1, 0, +1', () => {
  for (const [moves, expected] of [[0, 18], [1, 19], [2, 20], [3, 21]]) {
    const g = newGame();
    runFor(g, moves);
    assert.equal(g.phase, 'dead');
    assert.equal(g.ball, expected, `${moves} moves`);
  }
});

test('crossing the whole window is 6 yards, each further crossing adds 9', () => {
  const g = newGame();
  runFor(g, 8);
  assert.equal(g.ball, 26);
  const g2 = newGame();
  runFor(g2, 17);
  assert.equal(g2.ball, 35);
});

test('the manual example: 33 yards to a touchdown takes four crossings', () => {
  const g = newGame();
  g.ball = 67;
  clearDefense(g);
  for (let i = 0; i < 34; i++) g.move('fwd');
  assert.equal(g.phase, 'live'); // 34 moves = 32 yards, not in yet
  g.move('fwd');
  assert.equal(g.phase, 'dead');
  assert.equal(g.score.home, 7);
  assert.equal(g.offense, 'visitor');
  assert.equal(g.ball, 20);
});

test('ten yards earns a new first down; less costs a down', () => {
  const g = newGame();
  runFor(g, 5); // +3
  assert.deepEqual([g.down, g.ytg, g.ball], [2, 7, 23]);
  nextDown(g);
  runFor(g, 12); // +10
  assert.deepEqual([g.down, g.ytg, g.ball], [1, 10, 33]);
});

test('failing on fourth down turns the ball over at the spot', () => {
  const g = newGame();
  for (let i = 0; i < 4; i++) {
    runFor(g, 2); // no gain
    if (i < 3) nextDown(g);
  }
  assert.equal(g.offense, 'visitor');
  assert.equal(g.ball, 80);
  assert.deepEqual([g.down, g.ytg], [1, 10]);
  assert.ok(g.drainEvents().includes('turnover'));
});

test('losing yardage into your own end zone is a safety and the opponent gets the ball at its 20', () => {
  const g = newGame();
  g.ball = 2;
  runFor(g, 0);
  assert.equal(g.score.visitor, 2);
  assert.equal(g.offense, 'visitor');
  assert.equal(g.ball, 20);
});

test('a blocker and a tackler that collide are both removed', () => {
  const g = newGame();
  clearDefense(g);
  placeTackler(g, 2, 0); // straight ahead of the upper blocker at (1,0)
  g.move('fwd');
  assert.equal(g.phase, 'live');
  assert.equal(g.play.defenders.filter((d) => d.alive).length, 0);
  assert.equal(g.play.blockers.filter((b) => b.alive).length, 1);
});

test('running into a tackler ends the play', () => {
  const g = newGame();
  clearDefense(g);
  placeTackler(g, 1, 1);
  g.move('fwd');
  assert.equal(g.phase, 'dead');
  assert.equal(g.ball, 19);
});

test('pass: only the receiver moves, and he cannot enter an occupied cell', () => {
  const g = newGame();
  g.setSelector('pass');
  g.move('up'); // blocker is directly above him
  assert.deepEqual(g.play.receiver, { c: 1, r: 2 });
  g.move('fwd');
  assert.deepEqual(g.play.receiver, { c: 2, r: 2 });
  assert.deepEqual(g.play.qb, { c: 0, r: 1 });
});

test('pass: a receiver in line with the quarterback catches it and becomes the runner', () => {
  const g = newGame();
  g.setSelector('pass');
  clearDefense(g);
  g.move('fwd');
  g.move('fwd');
  g.move('up'); // receiver now at (3,1), in the quarterback's row
  g.kickPass();
  assert.equal(g.phase, 'flight');
  g.advance(1000);
  assert.equal(g.phase, 'live');
  assert.deepEqual(g.play.carrier, { c: 3, r: 1 });
  assert.equal(g.play.blockers.length, 0);
  placeTackler(g, 3, 0);
  g.move('up');
  assert.equal(g.ball, 21); // caught 3 yards downfield = +1
});

test('pass: nobody in line is incomplete, loss of down, no change in position', () => {
  const g = newGame();
  g.setSelector('pass');
  clearDefense(g);
  g.kickPass();
  g.advance(2000);
  assert.equal(g.phase, 'dead');
  assert.deepEqual([g.down, g.ytg, g.ball], [2, 10, 20]);
});

test('pass: a pass defender in line ahead of the receiver intercepts at that spot', () => {
  const g = newGame();
  g.setSelector('pass');
  g.kickPass(); // pass defenders start in the quarterback row at columns 6 and 8
  g.advance(2000);
  assert.equal(g.phase, 'dead');
  assert.equal(g.offense, 'visitor');
  assert.equal(g.ball, 100 - (20 + 6 - 2));
});

test('pass: a tackler reaching the quarterback before the throw is a 2-yard loss', () => {
  const g = new Game({ rng: () => 0 }); // every defender moves every turn
  g.setSkill(1);
  g.setSelector('pass');
  g.play.blockers[0].alive = false;
  g.move('down');
  g.advance(TUNING.defenderIntervalMs[1] * 10);
  assert.equal(g.phase, 'dead');
  assert.deepEqual([g.down, g.ball], [2, 18]);
});

test('kick is allowed on fourth down only, from the run/kick position', () => {
  const g = newGame();
  g.kickPass();
  assert.equal(g.phase, 'ready');
  g.down = 4;
  g.setSelector('pass');
  g.setSelector('run');
  g.kickPass();
  assert.equal(g.phase, 'kick');
});

test('a made field goal is 3 points and a kickoff', () => {
  const seq = [0.0, 0.99]; // kick good, then a normal (not short) kickoff
  const g = newGame();
  g.rng = () => (seq.length ? seq.shift() : 0.99);
  g.down = 4;
  g.ball = 90;
  g.kickPass();
  g.advance(2000);
  assert.equal(g.score.home, 3);
  assert.equal(g.offense, 'visitor');
  assert.equal(g.ball, 20);
});

test('a missed field goal is a punt and a turnover', () => {
  const g = newGame(() => 0.99);
  g.down = 4;
  g.ball = 30; // 70 yards out: cannot be made
  g.kickPass();
  g.advance(2000);
  assert.equal(g.score.home, 0);
  assert.equal(g.offense, 'visitor');
  assert.ok(g.ball >= 1 && g.ball <= 99);
  assert.ok(g.drainEvents().includes('turnover'));
});

test('a short kickoff makes the first play a runback, then first-and-ten at the spot', () => {
  const g = newGame(() => 0.0);
  g.kickoff('visitor');
  assert.equal(g.runback, true);
  g.setupPlay();
  g.phase = 'ready';
  assert.equal(g.play.type, 'runback');
  runFor(g, 7); // +5
  assert.deepEqual([g.down, g.ytg, g.ball], [1, 10, TUNING.runbackStartYard + 5]);
});

test('the clock runs only during a play', () => {
  const g = newGame();
  g.advance(60000);
  assert.equal(g.clock, 150);
  clearDefense(g);
  g.move('down');
  g.advance(TUNING.msPerClockTenth * 3);
  assert.equal(g.clock, 147);
});

test('quarters roll over; visitors receive at their 20 after halftime; game locks after the fourth', () => {
  const g = newGame();
  for (let q = 1; q <= 4; q++) {
    assert.equal(g.quarter, q);
    if (q === 3) assert.deepEqual([g.offense, g.ball, g.down], ['visitor', 20, 1]);
    g.clock = 0;
    runFor(g, 2);
    if (q < 4) {
      assert.equal(g.phase, 'quarterEnd');
      assert.equal(g.view().mode, 'status');
      nextDown(g);
      assert.equal(g.clock, 150);
    }
  }
  assert.equal(g.phase, 'gameOver');
  g.pressDisplay();
  g.releaseDisplay();
  g.move('fwd');
  assert.equal(g.phase, 'gameOver');
});

test('status readout matches the manual: u on own side, d on the defensive side', () => {
  const g = newGame();
  Object.assign(g, { down: 3, ytg: 9, ball: 25 });
  assert.equal(text(g.statusDigits('status1')), '3  9 u 25');
  g.ball = 75;
  assert.equal(text(g.statusDigits('status1')), '3  9 d 25');
  g.score = { home: 14, visitor: 7 };
  g.clock = 119;
  assert.equal(text(g.statusDigits('status2')), '14 11.9 07');
});

test('DISPLAY alternates status and score, and resets the field after a play', () => {
  const g = newGame();
  g.pressDisplay();
  assert.equal(text(g.view().digits), '1 10 u 20');
  g.releaseDisplay();
  g.pressDisplay();
  assert.equal(text(g.view().digits), '00 15.0 00');
  g.releaseDisplay();
  runFor(g, 3);
  assert.equal(g.view().cells.length, 1); // only the ball carrier, at the spot
  assert.equal(g.view().cells[0].blink, true);
  g.move('fwd');
  assert.equal(g.phase, 'dead'); // nothing happens until DISPLAY is pressed
  nextDown(g);
  assert.equal(g.phase, 'ready');
});

test('the visitor formation is mirrored and drives right to left', () => {
  const g = newGame();
  g.offense = 'visitor';
  g.setupPlay();
  const carrier = g.view().cells.find((c) => c.blink);
  assert.equal(carrier.c, 8);
  clearDefense(g);
  g.move('fwd');
  assert.equal(g.view().cells.find((c) => c.blink).c, 7);
});

test('pass defenders trail the receiver on the goal-line side; they never aim in front of him', () => {
  const g = newGame();
  g.setSelector('pass');
  for (const col of [1, 2, 4, 6]) {
    g.play.receiver = { c: col, r: 2 };
    for (const d of g.play.defenders.filter((x) => x.role === 'pd')) {
      const t = g.guardTarget(d);
      assert.ok(t.c > col, `receiver at ${col}, defender aims at ${t.c}`);
      assert.equal(t.r, g.play.qb.r);
    }
  }
});

test('pass: stepping into the quarterback row and throwing is a completion even after the defense has had time to react', () => {
  let completions = 0;
  let attempts = 0;
  for (let seed = 1; seed <= 200; seed++) {
    let x = seed * 9973;
    const rng = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const g = new Game({ rng });
    g.setSkill(1);
    g.setSelector('pass');
    g.move('fwd');
    g.advance(1500); // hesitate
    if (g.phase !== 'live') continue; // sacked while waiting
    g.move('up');
    if (g.play.receiver.r !== g.play.qb.r) continue; // a rusher took that cell
    attempts++;
    g.kickPass();
    g.advance(1000);
    assert.equal(g.offense, 'home', 'a receiver in line must never be intercepted from in front');
    if (g.play.carrier) completions++;
  }
  assert.ok(attempts > 30);
  assert.equal(completions, attempts);
});
