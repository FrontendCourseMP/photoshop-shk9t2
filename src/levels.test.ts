import { expect, describe, it } from 'vitest';
import { applyLevels, DEFAULT_LEVELS, DEFAULT_LEVELS_STATE, isDefaultLevels } from './levels';
import type { PixelImage } from './gb7';

describe('Levels', () => {
  const createTestImage = (pixelValues: number[]): PixelImage => {
    const data = new Uint8ClampedArray(pixelValues.length * 4);
    for (let i = 0; i < pixelValues.length; i++) {
      const val = pixelValues[i];
      data[i * 4] = val;     // R
      data[i * 4 + 1] = val; // G
      data[i * 4 + 2] = val; // B
      data[i * 4 + 3] = 255; // A
    }
    return { width: pixelValues.length, height: 1, data };
  };

  describe('isDefaultLevels', () => {
    it('should return true for default levels', () => {
      expect(isDefaultLevels(DEFAULT_LEVELS)).toBe(true);
    });

    it('should return false when black point changed', () => {
      expect(isDefaultLevels({ black: 10, white: 255, gamma: 1.0 })).toBe(false);
    });

    it('should return false when white point changed', () => {
      expect(isDefaultLevels({ black: 0, white: 200, gamma: 1.0 })).toBe(false);
    });

    it('should return false when gamma changed', () => {
      expect(isDefaultLevels({ black: 0, white: 255, gamma: 2.0 })).toBe(false);
    });
  });

  describe('applyLevels - grayscale', () => {
    it('should apply default levels without changes', () => {
      const image = createTestImage([0, 128, 255]);
      const result = applyLevels(image, DEFAULT_LEVELS_STATE, true, false);

      expect(result.data[0]).toBe(0);
      expect(result.data[4]).toBe(128);
      expect(result.data[8]).toBe(255);
    });

    it('should clamp black point', () => {
      const image = createTestImage([0, 50, 100, 150, 200, 255]);
      const state = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 100, white: 255, gamma: 1.0 },
      };
      const result = applyLevels(image, state, true, false);

      expect(result.data[0]).toBe(0); // 0 < 100, maps to black (0)
      expect(result.data[8]).toBe(0); // 100 exactly at black point
    });

    it('should clamp white point', () => {
      const image = createTestImage([0, 50, 100, 150, 200, 255]);
      const state = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 0, white: 200, gamma: 1.0 },
      };
      const result = applyLevels(image, state, true, false);

      expect(result.data[20]).toBe(255); // 200 exactly at white point
      expect(result.data[24]).toBe(255); // 255 > 200, maps to white (255)
    });

    it('should apply gamma correction', () => {
      const image = createTestImage([128]);
      const stateGamma2 = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 0, white: 255, gamma: 2.0 },
      };
      const result = applyLevels(image, stateGamma2, true, false);

      // At gamma 2.0, midpoint (128/255 ≈ 0.502) becomes (0.502^(1/2) ≈ 0.708)
      // Which maps to about 180 in 0-255 range
      const value = result.data[0];
      expect(value).toBeGreaterThan(128);
      expect(value).toBeLessThan(200);
    });

    it('should preserve alpha channel when hasAlpha is true', () => {
      const data = new Uint8ClampedArray(4);
      data[0] = 128; // R
      data[1] = 128; // G
      data[2] = 128; // B
      data[3] = 200; // A
      const image = { width: 1, height: 1, data };
      const result = applyLevels(image, DEFAULT_LEVELS_STATE, true, true);

      expect(result.data[3]).toBe(200);
    });
  });

  describe('applyLevels - RGB', () => {
    it('should apply levels to RGB channels independently', () => {
      const data = new Uint8ClampedArray(4);
      data[0] = 255; // R
      data[1] = 128; // G
      data[2] = 0;   // B
      data[3] = 255; // A
      const image = { width: 1, height: 1, data };

      const state = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 0, white: 255, gamma: 1.0 },
        red: { black: 100, white: 255, gamma: 1.0 },
        green: { black: 0, white: 200, gamma: 1.0 },
        blue: { black: 0, white: 255, gamma: 1.0 },
      };

      const result = applyLevels(image, state, false, true);

      // Red: master(255) -> red(255 in [100-255]) -> 255
      expect(result.data[0]).toBe(255);
      // Green: master(128) -> green(128 in [0-200]) -> ~163
      expect(result.data[1]).toBeGreaterThan(120);
      expect(result.data[1]).toBeLessThan(180);
      // Blue: master(0) -> blue(0 in [0-255]) -> 0
      expect(result.data[2]).toBe(0);
    });

    it('should apply alpha channel levels', () => {
      const data = new Uint8ClampedArray(4);
      data[0] = 128; // R
      data[1] = 128; // G
      data[2] = 128; // B
      data[3] = 200; // A
      const image = { width: 1, height: 1, data };

      const state = {
        ...DEFAULT_LEVELS_STATE,
        alpha: { black: 0, white: 200, gamma: 1.0 },
      };

      const result = applyLevels(image, state, false, true);

      // Alpha: 200 is at white point, maps to 255
      expect(result.data[3]).toBe(255);
    });
  });

  describe('applyLevels - edge cases', () => {
    it('should handle extreme gamma values', () => {
      const image = createTestImage([128]);
      const stateLowGamma = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 0, white: 255, gamma: 0.1 },
      };
      const result = applyLevels(image, stateLowGamma, true, false);

      // Low gamma should brighten
      expect(result.data[0]).toBeGreaterThan(200);
    });

    it('should handle high gamma values', () => {
      const image = createTestImage([128]);
      const stateHighGamma = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 0, white: 255, gamma: 9.9 },
      };
      const result = applyLevels(image, stateHighGamma, true, false);

      // High gamma should darken
      expect(result.data[0]).toBeLessThan(128);
    });

    it('should handle inverted range (black > white should not crash)', () => {
      const image = createTestImage([128]);
      // This shouldn't crash, though it's technically invalid
      const state = {
        ...DEFAULT_LEVELS_STATE,
        master: { black: 200, white: 100, gamma: 1.0 },
      };
      const result = applyLevels(image, state, true, false);

      // Should produce some output without crashing
      expect(result.data.length).toBe(4);
    });
  });

  describe('DEFAULT_LEVELS_STATE', () => {
    it('should have correct initial values', () => {
      expect(DEFAULT_LEVELS_STATE.master.black).toBe(0);
      expect(DEFAULT_LEVELS_STATE.master.white).toBe(255);
      expect(DEFAULT_LEVELS_STATE.master.gamma).toBe(1.0);
      expect(DEFAULT_LEVELS_STATE.red).toEqual(DEFAULT_LEVELS_STATE.master);
      expect(DEFAULT_LEVELS_STATE.green).toEqual(DEFAULT_LEVELS_STATE.master);
      expect(DEFAULT_LEVELS_STATE.blue).toEqual(DEFAULT_LEVELS_STATE.master);
      expect(DEFAULT_LEVELS_STATE.alpha).toEqual(DEFAULT_LEVELS_STATE.master);
    });
  });
});
