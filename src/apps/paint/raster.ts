// Pixel helpers for Paint, kept free of DOM types so they can be unit tested.

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RGBA = [number, number, number, number];

export function hexToRgba(hex: string): RGBA {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex([r, g, b]: RGBA | number[]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function getPixel(img: Pixels, x: number, y: number): RGBA {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/** Scanline flood fill. Returns the number of pixels changed. */
export function floodFill(img: Pixels, x0: number, y0: number, color: RGBA): number {
  const { width: w, height: h, data } = img;
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return 0;
  const target = getPixel(img, x0, y0);
  if (target.every((v, i) => v === color[i])) return 0;
  const match = (i: number) => data[i] === target[0] && data[i + 1] === target[1] && data[i + 2] === target[2] && data[i + 3] === target[3];
  const set = (i: number) => {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  };
  let changed = 0;
  const stack: [number, number][] = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    let lx = x;
    while (lx >= 0 && match((y * w + lx) * 4)) lx--;
    lx++;
    let up = false;
    let down = false;
    for (let cx = lx; cx < w && match((y * w + cx) * 4); cx++) {
      set((y * w + cx) * 4);
      changed++;
      if (y > 0) {
        const m = match(((y - 1) * w + cx) * 4);
        if (m && !up) stack.push([cx, y - 1]);
        up = m;
      }
      if (y < h - 1) {
        const m = match(((y + 1) * w + cx) * 4);
        if (m && !down) stack.push([cx, y + 1]);
        down = m;
      }
    }
  }
  return changed;
}

/** Points on a line, for pencil strokes without gaps. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** The classic 28-color palette, with Solana purple and green swapped in. */
export const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#9945ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#14f195', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];
