import type { PixelImage } from './gb7';
import type { Channel } from './color';

export type HistogramData = {
  bins: Uint32Array;
  max: number;
  min: number;
};

/**
 * Calculate histogram for a specific channel.
 * For grayscale: uses the gray value directly (0-255)
 * For RGB channels: uses the specific channel value (0-255)
 * For alpha: uses the alpha value (0-255)
 */
export function calculateHistogram(
  image: PixelImage,
  channel: Channel,
  grayscale: boolean,
  binCount: number = 256
): HistogramData {
  const bins = new Uint32Array(binCount);
  let max = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    let value = 0;

    if (channel === 'alpha') {
      value = image.data[i + 3];
    } else if (channel === 'gray' || grayscale) {
      value = image.data[i]; // Gray is stored in R channel for grayscale images
    } else if (channel === 'red') {
      value = image.data[i];
    } else if (channel === 'green') {
      value = image.data[i + 1];
    } else if (channel === 'blue') {
      value = image.data[i + 2];
    }

    const bin = Math.floor((value / 255) * (binCount - 1));
    bins[bin]++;
    max = Math.max(max, bins[bin]);
  }

  return { bins, max, min: 0 };
}

/**
 * Normalize histogram values for display (0-1 range)
 */
export function normalizeHistogram(data: HistogramData, logarithmic: boolean = false): number[] {
  const normalized: number[] = [];

  for (let i = 0; i < data.bins.length; i++) {
    let value = data.bins[i] / Math.max(data.max, 1);

    if (logarithmic && value > 0) {
      value = Math.log(value + 1) / Math.log(data.max + 1);
    }

    normalized.push(value);
  }

  return normalized;
}

/**
 * Get histogram for master (composite) - calculates luminance
 */
export function calculateMasterHistogram(
  image: PixelImage,
  grayscale: boolean,
  binCount: number = 256
): HistogramData {
  const bins = new Uint32Array(binCount);
  let max = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    let luminance = 0;

    if (grayscale) {
      luminance = image.data[i];
    } else {
      // Standard luminance formula
      luminance = Math.round(
        0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
      );
    }

    const bin = Math.floor((luminance / 255) * (binCount - 1));
    bins[bin]++;
    max = Math.max(max, bins[bin]);
  }

  return { bins, max, min: 0 };
}
