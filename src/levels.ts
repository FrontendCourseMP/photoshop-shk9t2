import type { PixelImage } from './gb7';
import type { Channel } from './color';

export type LevelsSettings = {
  black: number;    // 0-255
  white: number;    // 0-255
  gamma: number;    // 0.1-9.9
};

export type LevelsState = {
  master: LevelsSettings;
  red: LevelsSettings;
  green: LevelsSettings;
  blue: LevelsSettings;
  alpha: LevelsSettings;
};

export const DEFAULT_LEVELS: LevelsSettings = { black: 0, white: 255, gamma: 1.0 };

export const DEFAULT_LEVELS_STATE: LevelsState = {
  master: { ...DEFAULT_LEVELS },
  red: { ...DEFAULT_LEVELS },
  green: { ...DEFAULT_LEVELS },
  blue: { ...DEFAULT_LEVELS },
  alpha: { ...DEFAULT_LEVELS },
};

/**
 * Build a Look-Up Table (LUT) for fast levels application
 */
function buildLUT(settings: LevelsSettings, maxValue: number = 255): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const { black, white, gamma } = settings;
  const range = white - black;

  for (let i = 0; i < 256; i++) {
    if (i < black) {
      lut[i] = 0;
    } else if (i > white) {
      lut[i] = maxValue;
    } else {
      // Normalize to 0-1
      const normalized = (i - black) / range;
      // Apply gamma correction
      const gammaCorrect = Math.pow(Math.max(0, normalized), 1 / gamma);
      // Scale back to output range
      lut[i] = Math.round(gammaCorrect * maxValue);
    }
  }

  return lut;
}

/**
 * Apply levels correction to image
 */
export function applyLevels(
  image: PixelImage,
  state: LevelsState,
  grayscale: boolean,
  hasAlpha: boolean
): PixelImage {
  const data = new Uint8ClampedArray(image.data.length);
  
  const masterLUT = buildLUT(state.master);
  const redLUT = buildLUT(state.red);
  const greenLUT = buildLUT(state.green);
  const blueLUT = buildLUT(state.blue);
  const alphaLUT = buildLUT(state.alpha, 255);

  for (let i = 0; i < image.data.length; i += 4) {
    if (grayscale) {
      // For grayscale: apply master levels to gray value
      const gray = masterLUT[image.data[i]];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      data[i + 3] = hasAlpha ? alphaLUT[image.data[i + 3]] : 255;
    } else {
      // For RGB: apply master to all, then individual channel levels
      const r = masterLUT[image.data[i]];
      const g = masterLUT[image.data[i + 1]];
      const b = masterLUT[image.data[i + 2]];

      data[i] = redLUT[r];
      data[i + 1] = greenLUT[g];
      data[i + 2] = blueLUT[b];
      data[i + 3] = hasAlpha ? alphaLUT[image.data[i + 3]] : 255;
    }
  }

  return { width: image.width, height: image.height, data };
}

/**
 * Check if levels are at default values
 */
export function isDefaultLevels(settings: LevelsSettings): boolean {
  return settings.black === 0 && settings.white === 255 && settings.gamma === 1.0;
}
