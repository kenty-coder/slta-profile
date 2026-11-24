// 紙吹雪（レベルアップのお祝い用）  作成：KENTA SHINKAWA
// launchConfetti() で画面いっぱいに数秒間舞う。stopConfetti() ですぐ消す。
const COLORS = ['#e4572e', '#f0a04b', '#f2c94c', '#3a9d6e', '#2f80ed', '#8e5bd0', '#e85d9a', '#14284b'];
let current = null;

export function stopConfetti() {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  window.removeEventListener('resize', current.onResize);
  current.canvas.remove();
  current = null;
}

export function launchConfetti({ duration = 6000 } = {}) {
  stopConfetti();
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  let w = 0, h = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  if (reduced) duration = Math.min(duration, 3500);
  const count = reduced ? 28 : Math.round(Math.min(260, Math.max(140, (w * h) / 4500)));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const make = (initial) => {
    const size = rnd(8, 16);
    return {
      x: rnd(0, w),
      y: initial ? rnd(-h, 0) : rnd(-40, -10),
      w: size, h: size * rnd(0.4, 0.75),
      vx: reduced ? 0 : rnd(-70, 70),
      vy: reduced ? rnd(60, 110) : rnd(140, 330),
      rot: rnd(0, Math.PI * 2), vr: reduced ? 0 : rnd(-7, 7),
      sway: rnd(0, Math.PI * 2), swaySpeed: rnd(1.5, 4), swayAmp: reduced ? 0 : rnd(15, 50),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.25,
    };
  };
  const parts = Array.from({ length: count }, () => make(true));

  // 最初に左右下からも吹き上げる（視差効果を減らす設定のときは出さない）
  if (!reduced) {
    for (let i = 0; i < 90; i++) {
      const left = i % 2 === 0;
      const p = make(false);
      p.x = left ? -10 : w + 10; p.y = h * rnd(0.55, 0.95);
      p.vx = (left ? 1 : -1) * rnd(180, 620); p.vy = -rnd(500, 1050);
      parts.push(p);
    }
  }

  const start = performance.now();
  let last = start;
  const state = { canvas, raf: 0, onResize: resize };
  current = state;
  window.addEventListener('resize', resize);

  const frame = (now) => {
    if (current !== state) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const elapsed = now - start;
    const ending = elapsed > duration;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts) {
      if (p.vy < 200) p.vy += 900 * dt; // 吹き上げた分は重力で落ちる
      p.vx *= (1 - 1.2 * dt);
      p.sway += p.swaySpeed * dt;
      p.x += (p.vx + Math.sin(p.sway) * p.swayAmp) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > h + 30) {
        if (ending) continue;
        Object.assign(p, make(false));
      }
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, reduced ? 1 : Math.cos(p.sway * 1.7)); // ひらひら
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (ending && (alive === 0 || elapsed > duration + 4000)) { stopConfetti(); return; }
    state.raf = requestAnimationFrame(frame);
  };
  state.raf = requestAnimationFrame(frame);
}
