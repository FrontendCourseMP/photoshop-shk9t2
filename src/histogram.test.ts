import { expect, describe, it } from 'vitest';
import { calculateHistogram, normalizeHistogram, calculateMasterHistogram } from './histogram';
import type { PixelImage } from './gb7';

describe('Histogram', () => {
  const createTestImage = (pixelCount: number, values: number[]): PixelImage => {
    const data = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const val = values[i % values.length];
      data[i * 4] = val;     // R
      data[i * 4 + 1] = val; // G
      data[i * 4 + 2] = val; // B
      data[i * 4 + 3] = 255; // A
    }
    return { width: pixelCount, height: 1, data };
  };

  describe('calculateHistogram', () => {
    it('should calculate grayscale histogram correctly', () => {
      const image = createTestImage(256, Array.from({ length: 256 }, (_, i) => i));
      const hist = calculateHistogram(image, 'gray', true);

      expect(hist.bins.length).toBe(256);
      expect(hist.max).toBe(1);
      for (let i = 0; i < 256; i++) {
        expect(hist.bins[i]).toBe(1);
      }
    });

    it('should handle red channel', () => {
      const image = createTestImage(100, [255]);
      const hist = calculateHistogram(image, 'red', false);

      expect(hist.bins[255]).toBe(100);
      expect(hist.max).toBe(100);
    });

    it('should handle alpha channel', () => {
      const data = new Uint8ClampedArray(400); // 100 pixels * 4
      for (let i = 0; i < 100; i++) {
        data[i * 4 + 3] = 128; // Alpha = 128
      }
      const image = { width: 100, height: 1, data };
      const hist = calculateHistogram(image, 'alpha', false);

      expect(hist.bins[127] + hist.bins[128]).toBeGreaterThan(0);
      expect(hist.max).toBe(100);
    });

    it('should work with different bin counts', () => {
      const image = createTestImage(256, Array.from({ length: 256 }, (_, i) => i));
      const hist = calculateHistogram(image, 'gray', true, 128);

      expect(hist.bins.length).toBe(128);
      expect(hist.max).toBeGreaterThan(0);
    });
  });

  describe('calculateMasterHistogram', () => {
    it('should calculate luminance correctly for grayscale', () => {
      const image = createTestImage(100, [128]);
      const hist = calculateMasterHistogram(image, true);

      expect(hist.max).toBe(100);
      // Should have non-zero bin for value 128
      expect(hist.bins.some(b => b > 0)).toBe(true);
    });

    it('should calculate luminance for RGB', () => {
      const data = new Uint8ClampedArray(400); // 100 pixels
      for (let i = 0; i < 100; i++) {
        data[i * 4] = 255;     // R
        data[i * 4 + 1] = 0;   // G
        data[i * 4 + 2] = 0;   // B
        data[i * 4 + 3] = 255; // A
      }
      const image = { width: 100, height: 1, data };
      const hist = calculateMasterHistogram(image, false);

      expect(hist.max).toBe(100);
      // Red channel contributes 0.299 to luminance, so ~76.47
      expect(hist.bins.some(b => b > 50)).toBe(true);
    });

    it('should use standard luminance formula', () => {
      const data = new Uint8ClampedArray(4);
      data[0] = 255; // R
      data[1] = 255; // G
      data[2] = 255; // B
      data[3] = 255; // A
      const image = { width: 1, height: 1, data };
      const hist = calculateMasterHistogram(image, false);

      // White (255,255,255) should map to 255
      expect(hist.bins[255]).toBe(1);
    });
  });

  describe('normalizeHistogram', () => {
    it('should normalize linear histogram to 0-1 range', () => {
      const hist = {
        bins: new Uint32Array([0, 50, 100, 50, 0]),
        max: 100,
        min: 0,
      };

      const normalized = normalizeHistogram(hist, false);

      expect(normalized.length).toBe(5);
      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBe(0.5);
      expect(normalized[2]).toBe(1);
      expect(normalized[3]).toBe(0.5);
      expect(normalized[4]).toBe(0);
    });

    it('should normalize logarithmic histogram', () => {
      const hist = {
        bins: new Uint32Array([1, 10, 100, 10, 1]),
        max: 100,
        min: 0,
      };

      const normalized = normalizeHistogram(hist, true);

      expect(normalized.length).toBe(5);
      for (let val of normalized) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
      // Logarithmic should compress the range
      expect(normalized[2] < 1).toBe(true);
    });

    it('should handle empty histogram', () => {
      const hist = {
        bins: new Uint32Array([0, 0, 0]),
        max: 0,
        min: 0,
      };

      const normalized = normalizeHistogram(hist, false);

      expect(normalized).toEqual([0, 0, 0]);
    });
  });
});
