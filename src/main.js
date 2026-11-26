import { Game } from './engine.js';
import { Display } from './display.js';
import { Sound } from './sound.js';

const game = new Game();
const display = new Display(document.getElementById('display'));
const sound = new Sound();
const live = document.getElementById('announce');
const $ = (id) => document.getElementById(id);

// ---------- switches ----------

function setSkill(n) {
  sound.unlock();
  game.setSkill(n);
  for (const b of document.querySelectorAll('[data-skill]')) {
    b.setAttribute('aria-checked', String(Number(b.dataset.skill) === n));
  }
  if (n === 0) setSelector('run', true);
}

function setSelector(sel, silent = false) {
  if (!silent) sound.unlock();
  game.setSelector(sel);
  for (const b of document.querySelectorAll('[data-selector]')) {
    b.setAttribute('aria-checked', String(b.dataset.selector === game.selector));
  }
}

for (const b of document.querySelectorAll('[data-skill]')) {
  b.addEventListener('click', () => setSkill(Number(b.dataset.skill)));
}
for (const b of document.querySelectorAll('[data-selector]')) {
  b.addEventListener('click', () => setSelector(b.dataset.selector));
}

// ---------- keys ----------

const actions = {
  up: () => game.move('up'),
  down: () => game.move('down'),
  fwd: () => game.move('fwd'),
  kp: () => game.kickPass(),
};

function press(name, button) {
  sound.unlock();
  actions[name]();
  if (button) {
    button.classList.add('pressed');
    setTimeout(() => button.classList.remove('pressed'), 90);
  }
}

for (const [name, id] of [['up', 'btn-up'], ['down', 'btn-down'], ['fwd', 'btn-fwd'], ['kp', 'btn-kp']]) {
  const button = $(id);
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press(name, button);
  });
  // keyboard activation of a focused button
  button.addEventListener('click', (e) => {
    if (e.detail === 0) press(name, button);
  });
}

// DISPLAY is a hold key: status shows while it is down.
const btnD = $('btn-d');
let dHeld = false;
function displayDown() {
  if (dHeld) return;
  dHeld = true;
  sound.unlock();
  game.pressDisplay();
  btnD.classList.add('pressed');
}
function displayUp() {
  if (!dHeld) return;
  dHeld = false;
  game.releaseDisplay();
  btnD.classList.remove('pressed');
  announce();
}
btnD.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  btnD.setPointerCapture?.(e.pointerId);
  displayDown();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btnD.addEventListener(type, displayUp);

const keyMap = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowRight: 'fwd', ArrowLeft: 'fwd', KeyF: 'fwd',
  Space: 'kp', KeyK: 'kp',
};
const keyButton = { up: 'btn-up', down: 'btn-down', fwd: 'btn-fwd', kp: 'btn-kp' };

const gameKeys = new Set([...Object.keys(keyMap), 'KeyD', 'Enter', 'KeyR', 'KeyP', 'Digit0', 'Digit1', 'Digit2', 'KeyM']);

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A button clicked earlier keeps focus; drop it so Space or Enter drives the game, not that button.
  if (gameKeys.has(e.code) && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  if (e.code === 'KeyD' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) displayDown();
    return;
  }
  const action = keyMap[e.code];
  if (action) {
    e.preventDefault();
    if (!e.repeat) press(action, $(keyButton[action]));
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyR') setSelector('run');
  else if (e.code === 'KeyP') setSelector('pass');
  else if (e.code === 'Digit0') setSkill(0);
  else if (e.code === 'Digit1') setSkill(1);
  else if (e.code === 'Digit2') setSkill(2);
  else if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyD' || e.code === 'Enter') displayUp();
});
window.addEventListener('blur', displayUp);

// ---------- sound toggle ----------

const btnMute = $('btn-mute');
function toggleMute() {
  sound.muted = !sound.muted;
  btnMute.setAttribute('aria-pressed', String(sound.muted));
  btnMute.textContent = sound.muted ? 'Sound off' : 'Sound on';
}
btnMute.addEventListener('click', toggleMute);

// ---------- screen-reader status (not shown on screen) ----------

function announce() {
  if (game.phase === 'off') return;
  const own = game.ball < 50;
  const pos = own ? `own ${game.ball}` : `opponent ${100 - game.ball}`;
  live.textContent =
    `${game.offense === 'home' ? 'Home' : 'Visitor'} ball, down ${game.down}, ${game.ytg} to go, ${pos} yard line. ` +
    `Home ${game.score.home}, visitor ${game.score.visitor}.`;
}

// ---------- main loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100); // a hidden tab must not fast-forward the game
  last = now;
  game.advance(dt);
  for (const event of game.drainEvents()) sound.play(event);
  display.render(game.view(), Math.floor(now / 125) % 2 === 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook
window.__game = game;
