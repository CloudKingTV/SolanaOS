import { useSettings, type WallpaperId } from '../os/settings';

// Original wallpapers, drawn as SVG so they stay crisp at any resolution.

function MainnetHills() {
  return (
    <svg className="wallpaper-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e1a8a" />
          <stop offset="0.35" stopColor="#5b4ad8" />
          <stop offset="0.68" stopColor="#8fa6f0" />
          <stop offset="0.85" stopColor="#bfe9ea" />
        </linearGradient>
        <linearGradient id="wp-hill" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#3fe0a0" />
          <stop offset="0.45" stopColor="#16b77a" />
          <stop offset="1" stopColor="#0b6f55" />
        </linearGradient>
        <linearGradient id="wp-hill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#25c98c" />
          <stop offset="1" stopColor="#0a5c4a" />
        </linearGradient>
        <radialGradient id="wp-sheen" cx="0.38" cy="0.62" r="0.35">
          <stop offset="0" stopColor="#c9ffe6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#c9ffe6" stopOpacity="0" />
        </radialGradient>
        <filter id="wp-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="wp-glow">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-sky)" />
      {/* Validator nodes, faint in the upper sky */}
      <g fill="#e8dcff" filter="url(#wp-glow)" opacity="0.7">
        {[
          [120, 80, 2.4], [260, 150, 1.6], [410, 60, 2], [560, 130, 1.4], [720, 70, 2.6], [880, 140, 1.5],
          [1040, 50, 2.1], [1190, 120, 1.7], [1330, 70, 2.4], [1480, 150, 1.5], [980, 210, 1.3], [330, 230, 1.2],
          [640, 220, 1.4], [1400, 240, 1.2], [60, 200, 1.3], [1540, 40, 1.8],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      <g stroke="#e8dcff" strokeOpacity="0.12" strokeWidth="1">
        <path d="M120 80L260 150L410 60L560 130L720 70L880 140L1040 50L1190 120L1330 70L1480 150" fill="none" />
      </g>
      {/* Clouds */}
      <g fill="#ffffff" filter="url(#wp-blur)" opacity="0.85">
        <ellipse cx="300" cy="380" rx="190" ry="38" />
        <ellipse cx="420" cy="360" rx="120" ry="34" />
        <ellipse cx="1180" cy="300" rx="230" ry="40" />
        <ellipse cx="1320" cy="320" rx="150" ry="30" />
        <ellipse cx="820" cy="430" rx="160" ry="26" opacity="0.7" />
      </g>
      {/* Back hill */}
      <path d="M0 700C260 610 520 600 760 640S1260 720 1600 600V1000H0z" fill="url(#wp-hill2)" opacity="0.9" />
      {/* Front hill */}
      <path d="M0 760C300 620 640 560 960 620S1420 760 1600 820V1000H0z" fill="url(#wp-hill)" />
      <path d="M0 760C300 620 640 560 960 620S1420 760 1600 820V1000H0z" fill="url(#wp-sheen)" />
    </svg>
  );
}

function ValidatorNight() {
  const stars = Array.from({ length: 140 }, (_, i) => {
    // Deterministic pseudo-random scatter.
    const x = (i * 9301 + 49297) % 1600;
    const y = (i * 7919 + 12345) % 640;
    const r = ((i * 31) % 10) / 10 + 0.4;
    return { x, y, r, o: 0.3 + ((i * 17) % 7) / 10 };
  });
  return (
    <svg className="wallpaper-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="vn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05030f" />
          <stop offset="0.6" stopColor="#1a0f45" />
          <stop offset="1" stopColor="#2c1670" />
        </linearGradient>
        <linearGradient id="vn-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" stopOpacity="0" />
          <stop offset="0.3" stopColor="#9945FF" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#14F195" stopOpacity="0.5" />
          <stop offset="1" stopColor="#14F195" stopOpacity="0" />
        </linearGradient>
        <filter id="vn-blur">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>
      <rect width="1600" height="1000" fill="url(#vn-sky)" />
      <path d="M-100 420C300 250 600 380 900 300S1400 200 1700 320" stroke="url(#vn-aurora)" strokeWidth="120" fill="none" filter="url(#vn-blur)" />
      <g fill="#fff">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
        ))}
      </g>
      <path d="M0 780C300 700 600 690 900 730S1400 800 1600 760V1000H0z" fill="#0b0624" />
      <path d="M0 850C350 760 700 760 1000 800S1450 880 1600 860V1000H0z" fill="#06030f" />
    </svg>
  );
}

function GradientWall() {
  return (
    <svg className="wallpaper-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="gw" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5a1fc9" />
          <stop offset="0.55" stopColor="#3b6fd6" />
          <stop offset="1" stopColor="#12c98f" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#gw)" />
      <path
        transform="translate(560 330) scale(20)"
        fill="#ffffff"
        opacity="0.08"
        d="M4.5 0H24l-4.5 4.5H0zM0 7.5h19.5L24 12H4.5zM4.5 15H24l-4.5 4.5H0z"
      />
    </svg>
  );
}

export const WALLPAPERS: { id: WallpaperId; name: string }[] = [
  { id: 'none', name: '(None)' },
  { id: 'mainnet-hills', name: 'Mainnet Hills' },
  { id: 'validator-night', name: 'Validator Night' },
  { id: 'gradient', name: 'Gradient' },
];

export function WallpaperView({ id, color }: { id: WallpaperId; color: string }) {
  return (
    <div className="wallpaper" style={{ background: color }}>
      {id === 'mainnet-hills' && <MainnetHills />}
      {id === 'validator-night' && <ValidatorNight />}
      {id === 'gradient' && <GradientWall />}
    </div>
  );
}

export function Wallpaper() {
  const id = useSettings((s) => s.wallpaper);
  const color = useSettings((s) => s.backgroundColor);
  return <WallpaperView id={id} color={color} />;
}
