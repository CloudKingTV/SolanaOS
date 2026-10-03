import { useEffect, useRef } from 'react';
import type { ScreensaverId } from '../os/settings';

/** Canvas screensavers. `preview` renders inside the Display Properties monitor. */
export function ScreensaverCanvas({ kind, preview = false }: { kind: ScreensaverId; preview?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || kind === 'none') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.floor(r.width));
      h = canvas.height = Math.max(1, Math.floor(r.height));
    };
    resize();
    window.addEventListener('resize', resize);

    if (kind === 'starfield') {
      const colors = ['#ffffff', '#14F195', '#9945FF', '#c9b6ff'];
      const stars = Array.from({ length: preview ? 80 : 400 }, () => ({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: Math.random(),
        c: colors[Math.floor(Math.random() * colors.length)],
      }));
      const tick = () => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        for (const s of stars) {
          s.z -= 0.006;
          if (s.z <= 0.01) {
            s.x = (Math.random() - 0.5) * 2;
            s.y = (Math.random() - 0.5) * 2;
            s.z = 1;
          }
          const px = w / 2 + (s.x / s.z) * (w / 2);
          const py = h / 2 + (s.y / s.z) * (h / 2);
          const size = Math.max(0.5, (1 - s.z) * (preview ? 1.5 : 3));
          ctx.fillStyle = s.c;
          ctx.fillRect(px, py, size, size);
        }
        raf = requestAnimationFrame(tick);
      };
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      tick();
    } else if (kind === 'blocks') {
      // Bouncing Solana bars leaving fading trails, Mystify-style.
      const bars = Array.from({ length: 3 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 1.5),
        vy: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 1.5),
        hue: i * 50,
      }));
      const scale = preview ? 0.3 : 1;
      const tick = () => {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(0, 0, w, h);
        for (const b of bars) {
          b.x += b.vx;
          b.y += b.vy;
          if (b.x < 0 || b.x > w - 120 * scale) b.vx *= -1;
          if (b.y < 0 || b.y > h - 25 * scale) b.vy *= -1;
          b.hue = (b.hue + 0.4) % 360;
          const g = ctx.createLinearGradient(b.x, b.y + 25 * scale, b.x + 120 * scale, b.y);
          g.addColorStop(0, `hsl(${265 + Math.sin(b.hue / 57) * 15}, 100%, 63%)`);
          g.addColorStop(1, `hsl(${155 + Math.cos(b.hue / 57) * 15}, 90%, 52%)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(b.x + 22 * scale, b.y);
          ctx.lineTo(b.x + 120 * scale, b.y);
          ctx.lineTo(b.x + 98 * scale, b.y + 22 * scale);
          ctx.lineTo(b.x, b.y + 22 * scale);
          ctx.closePath();
          ctx.fill();
        }
        raf = requestAnimationFrame(tick);
      };
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      tick();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [kind, preview]);

  return <canvas ref={ref} className={preview ? 'ss-preview-canvas' : 'ss-canvas'} />;
}

export function Screensaver({ kind, onWake }: { kind: ScreensaverId; onWake: () => void }) {
  useEffect(() => {
    const start = Date.now();
    // Ignore the tiny mouse jitter right after it starts.
    const wake = () => Date.now() - start > 500 && onWake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [onWake]);
  return (
    <div className="screensaver">
      <ScreensaverCanvas kind={kind} />
    </div>
  );
}
