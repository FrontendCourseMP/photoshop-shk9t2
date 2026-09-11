import { describe, expect, it } from 'vitest';
import { renderChannels, toLab } from './color';

describe('channels and CIELAB', () => {
  it('removes disabled RGB components without mutating source data', () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([20, 30, 40, 128]) };
    expect([...renderChannels(image, new Set(['red', 'blue']), false).data]).toEqual([20, 0, 40, 255]);
    expect([...image.data]).toEqual([20, 30, 40, 128]);
  });
  it('converts white to CIELAB reference white', () => {
    const lab = toLab(255, 255, 255);
    expect(lab.l).toBeCloseTo(100, 1);
    expect(lab.a).toBeCloseTo(0, 1);
    expect(lab.b).toBeCloseTo(0, 1);
  });
});
