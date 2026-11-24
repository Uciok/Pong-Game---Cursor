const W = 800;
const H = 500;
const TOP = 18;
const BOTTOM = H - 18;
const WIN = 11;
const PLAYER_SPEED = 520;
const CPU_SPEED = 375;

const canvas = document.getElementById('court');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const kickerEl = document.getElementById('kicker');
const headlineEl = document.getElementById('headline');
const copyEl = document.getElementById('copy');
const actionEl = document.getElementById('action');
const youEl = document.getElementById('you');
const cpuEl = document.getElementById('cpu');
const live = document.getElementById('live');
const pauseBtn = document.getElementById('pause');
const upBtn = document.getElementById('up');
const downBtn = document.getElementById('down');

const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

const keys = new Set();
const scores = { you: 0, cpu: 0 };
let mode = 'menu';
let flash = 0;
let audioCtx = null;
let last = performance.now();

const left = makePaddle(46, -1);
const right = makePaddle(W - 46, 1);
const ball = {
  x: W / 2,
  y: H / 2,
  vx: 0,
  vy: 0,
  size: 12,
  speed: 320,
  held: true,
  hold: 0.4,
  dir: -1,
};

function makePaddle(x, side) {
  return {
    x,
    y: H / 2,
    w: 14,
    h: 96,
    vy: 0,
    side,
    aim: H / 2,
    think: 0,
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function padScore(n) {
  return String(n).padStart(2, '0');
}

function unlock() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep(freq, dur, gain = 0.045) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function showOverlay(kicker, title, copy, button) {
  kickerEl.textContent = kicker;
  headlineEl.textContent = title;
  copyEl.textContent = copy;
  actionEl.textContent = button;
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
}

function updateReadout(message) {
  youEl.textContent = padScore(scores.you);
  cpuEl.textContent = padScore(scores.cpu);
  if (message) live.textContent = message;
}

function setPauseEnabled(on) {
  pauseBtn.disabled = !on;
  pauseBtn.textContent = mode === 'pause' ? 'Resume' : 'Pause';
}

function resetBall(dir, hold = 0.7) {
  ball.x = W / 2;
  ball.y = H / 2;
  ball.vx = 0;
  ball.vy = 0;
  ball.speed = Math.max(320, ball.speed);
  ball.dir = dir;
  ball.held = true;
  ball.hold = hold;
}

function launch() {
  const angle = (Math.random() * 0.7 - 0.35);
  ball.vx = Math.cos(angle) * ball.speed * ball.dir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.held = false;
}

function startGame() {
  unlock();
  scores.you = 0;
  scores.cpu = 0;
  mode = 'play';
  left.y = H / 2;
  right.y = H / 2;
  ball.speed = 320;
  resetBall(-1, 0.55);
  hideOverlay();
  setPauseEnabled(true);
  updateReadout('Game on. You against the computer, first to 11.');
  canvas.focus();
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  showOverlay('Hold', 'Paused', 'Arrow keys move the left paddle.', 'Resume');
  setPauseEnabled(true);
  actionEl.focus();
}

function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  hideOverlay();
  setPauseEnabled(true);
  canvas.focus();
}

function finish(winner) {
  mode = 'over';
  const youWon = winner === 'you';
  showOverlay(
    'First to 11',
    youWon ? 'You win' : 'Computer wins',
    youWon
      ? 'The right paddle blinked first.'
      : 'Same arrows. Another rally.',
    'Play again'
  );
  setPauseEnabled(false);
  updateReadout(youWon ? 'You win, 11.' : 'Computer wins.');
  if (youWon) {
    beep(523, 0.08);
    setTimeout(() => beep(659, 0.08), 90);
    setTimeout(() => beep(784, 0.16), 180);
  } else {
    beep(196, 0.14);
    setTimeout(() => beep(130, 0.2), 130);
  }
  actionEl.focus();
}

function score(who) {
  if (mode !== 'play') {
    ball.speed = 320;
    resetBall(Math.random() < 0.5 ? 1 : -1, 0.45);
    return;
  }
  scores[who] += 1;
  flash = 0.16;
  ball.speed = 320;
  updateReadout(
    who === 'you'
      ? `You score. ${scores.you} to ${scores.cpu}.`
      : `Computer scores. ${scores.you} to ${scores.cpu}.`
  );
  if (scores[who] >= WIN) {
    beep(who === 'you' ? 700 : 150, 0.12);
    finish(who);
    return;
  }
  beep(170, 0.14, 0.05);
  resetBall(who === 'you' ? 1 : -1);
}

function predictY(targetX) {
  let x = ball.x;
  let y = ball.y;
  let vx = ball.vx;
  let vy = ball.vy;
  for (let i = 0; i < 10; i += 1) {
    if (Math.abs(vx) < 1) return y;
    const timeX = (targetX - x) / vx;
    if (timeX <= 0) return y;
    const timeY = vy > 0 ? (BOTTOM - y) / vy : vy < 0 ? (TOP - y) / vy : Infinity;
    if (timeX <= timeY) return clamp(y + vy * timeX, TOP, BOTTOM);
    y += vy * timeY;
    x += vx * timeY;
    vy *= -1;
  }
  return y;
}

function aiTarget(paddle, dt) {
  const coming = (paddle.side === 1 && ball.vx > 0) || (paddle.side === -1 && ball.vx < 0);
  if (ball.held || !coming) return H / 2;
  paddle.think -= dt;
  if (paddle.think <= 0) {
    const face = paddle.x - paddle.side * (paddle.w / 2 + ball.size / 2);
    const error = (Math.random() * 2 - 1) * (mode === 'play' ? 48 : 18);
    paddle.aim = predictY(face) + error;
    paddle.think = 0.16 + Math.random() * 0.14;
  }
  return paddle.aim;
}

function movePaddle(paddle, dt, cpu) {
  const previous = paddle.y;
  if (cpu) {
    const target = aiTarget(paddle, dt);
    const delta = target - paddle.y;
    if (Math.abs(delta) > 5) {
      paddle.y += clamp(delta, -CPU_SPEED * dt, CPU_SPEED * dt);
    }
  } else {
    let dir = 0;
    if (keys.has('ArrowUp')) dir -= 1;
    if (keys.has('ArrowDown')) dir += 1;
    paddle.y += dir * PLAYER_SPEED * dt;
  }
  paddle.y = clamp(paddle.y, TOP + paddle.h / 2, BOTTOM - paddle.h / 2);
  paddle.vy = dt > 0 ? (paddle.y - previous) / dt : 0;
}

function overlaps(paddle) {
  return Math.abs(ball.x - paddle.x) < paddle.w / 2 + ball.size / 2
    && Math.abs(ball.y - paddle.y) < paddle.h / 2 + ball.size / 2;
}

function bounce(paddle, dir) {
  const rel = clamp((ball.y - paddle.y) / (paddle.h / 2), -1, 1);
  ball.speed = Math.min(ball.speed * 1.05 + 10, 720);
  const angle = rel * 1.02;
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed + paddle.vy * 0.2;
  const maxVy = ball.speed * 0.9;
  ball.vy = clamp(ball.vy, -maxVy, maxVy);
  if (Math.abs(ball.vx) < ball.speed * 0.42) ball.vx = ball.speed * 0.42 * dir;
  ball.x = paddle.x + dir * (paddle.w / 2 + ball.size / 2 + 1);
  beep(dir > 0 ? 440 : 310, 0.045);
}

function step(dt) {
  const attract = mode === 'menu';
  if (mode === 'pause' || mode === 'over') return;

  movePaddle(left, dt, attract || mode !== 'play');
  movePaddle(right, dt, true);

  if (ball.held) {
    ball.hold -= dt;
    if (ball.hold <= 0) launch();
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y < TOP) {
    ball.y = TOP;
    ball.vy = Math.abs(ball.vy);
    beep(620, 0.035, 0.03);
  } else if (ball.y > BOTTOM) {
    ball.y = BOTTOM;
    ball.vy = -Math.abs(ball.vy);
    beep(620, 0.035, 0.03);
  }

  if (overlaps(left) && ball.vx < 0) bounce(left, 1);
  if (overlaps(right) && ball.vx > 0) bounce(right, -1);

  if (ball.x < -24) score('cpu');
  else if (ball.x > W + 24) score('you');
}

function drawDigit(value, x, y, scale) {
  const rows = GLYPHS[value];
  ctx.fillStyle = '#d8ff9a';
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (rows[r][c] === '1') ctx.fillRect(x + c * scale, y + r * scale, scale - 1, scale - 1);
    }
  }
}

function drawNumber(value, centerX, y) {
  const text = String(value);
  const scale = 8;
  const gap = scale;
  const width = text.length * scale * 3 + (text.length - 1) * gap;
  let x = centerX - width / 2;
  for (const ch of text) {
    drawDigit(Number(ch), x, y, scale);
    x += scale * 3 + gap;
  }
}

function drawPaddle(paddle, color) {
  ctx.fillStyle = color;
  ctx.fillRect(paddle.x - paddle.w / 2, paddle.y - paddle.h / 2, paddle.w, paddle.h);
}

function draw() {
  ctx.fillStyle = '#06140c';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#d8ff9a';
  ctx.fillRect(0, 6, W, 6);
  ctx.fillRect(0, H - 12, W, 6);

  ctx.strokeStyle = 'rgba(216, 255, 154, 0.55)';
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 16]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 24);
  ctx.lineTo(W / 2, H - 24);
  ctx.stroke();
  ctx.setLineDash([]);

  drawNumber(scores.you, W * 0.28, 36);
  drawNumber(scores.cpu, W * 0.72, 36);
  drawPaddle(left, '#f3ffd2');
  drawPaddle(right, '#b6e07a');

  ctx.fillStyle = '#fff4c2';
  ctx.fillRect(ball.x - ball.size / 2, ball.y - ball.size / 2, ball.size, ball.size);

  if (ball.held && mode === 'play') {
    ctx.fillStyle = 'rgba(216, 255, 154, 0.8)';
    ctx.font = '16px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SERVE', W / 2, H / 2 - 28);
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(216, 255, 154, ${Math.min(0.28, flash)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

function frame(now) {
  const dt = Math.min(0.034, (now - last) / 1000);
  last = now;
  if (flash > 0) flash = Math.max(0, flash - dt);
  const slices = 3;
  for (let i = 0; i < slices; i += 1) step(dt / slices);
  draw();
  requestAnimationFrame(frame);
}

function holdKey(key) {
  return (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    unlock();
    keys.add(key);
  };
}

function releaseKey(key) {
  return () => keys.delete(key);
}

actionEl.addEventListener('click', () => {
  unlock();
  if (mode === 'pause') resume();
  else startGame();
});

pauseBtn.addEventListener('click', () => {
  unlock();
  if (mode === 'play') pause();
  else if (mode === 'pause') resume();
});

upBtn.addEventListener('pointerdown', holdKey('ArrowUp'));
downBtn.addEventListener('pointerdown', holdKey('ArrowDown'));
for (const btn of [upBtn, downBtn]) {
  const key = btn === upBtn ? 'ArrowUp' : 'ArrowDown';
  btn.addEventListener('pointerup', releaseKey(key));
  btn.addEventListener('pointerleave', releaseKey(key));
  btn.addEventListener('pointercancel', releaseKey(key));
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    keys.add(event.key);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (event.repeat) return;
    unlock();
    if (mode === 'menu' || mode === 'over') startGame();
    else if (mode === 'pause') resume();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key);
});

window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
canvas.addEventListener('pointerdown', () => canvas.focus());

resize();
updateReadout();
requestAnimationFrame(frame);

window.__pong = {
  scores,
  ball,
  left,
  right,
  keys,
  get mode() { return mode; },
};
