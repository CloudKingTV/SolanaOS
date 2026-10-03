import { describe, expect, it } from 'vitest';
import { floodFill, getPixel, hexToRgba, linePoints, rgbaToHex } from './raster';

function blank(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  return { width: w, height: h, data };
}

describe('paint raster', () => {
  it('converts colors', () => {
    expect(hexToRgba('#9945ff')).toEqual([0x99, 0x45, 0xff, 255]);
    expect(hexToRgba('#fff')).toEqual([255, 255, 255, 255]);
    expect(rgbaToHex([20, 241, 149, 255])).toBe('#14f195');
  });

  it('fills an enclosed region only', () => {
    const img = blank(10, 10);
    // Vertical wall at x=5.
    for (let y = 0; y < 10; y++) img.data.set([0, 0, 0, 255], (y * 10 + 5) * 4);
    expect(floodFill(img, 0, 0, [255, 0, 0, 255])).toBe(50);
    expect(getPixel(img, 4, 9)).toEqual([255, 0, 0, 255]);
    expect(getPixel(img, 6, 0)).toEqual([255, 255, 255, 255]);
    expect(floodFill(img, 0, 0, [255, 0, 0, 255])).toBe(0);
  });

  it('draws gapless lines', () => {
    expect(linePoints(0, 0, 3, 1)).toHaveLength(4);
    expect(linePoints(2, 2, 2, 2)).toEqual([[2, 2]]);
  });
});
