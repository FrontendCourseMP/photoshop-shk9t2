import type { PixelImage } from './gb7';

export const INTERPOLATION_METHODS = ['bilinear', 'nearest'] as const;

export type InterpolationMethod = (typeof INTERPOLATION_METHODS)[number] | (string & {});

export type ResizeOptions = {
  width: number;
  height: number;
  method?: InterpolationMethod;
};

export const RESIZE_MAX_DIM = 65535;
export const RESIZE_MIN_DIM = 1;

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function validateResize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Размеры должны быть числами.');
  }
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < RESIZE_MIN_DIM || h < RESIZE_MIN_DIM || w > RESIZE_MAX_DIM || h > RESIZE_MAX_DIM) {
    throw new Error(`Размеры должны быть от ${RESIZE_MIN_DIM} до ${RESIZE_MAX_DIM} пикселей.`);
  }
  return { w, h };
}

function sample(source: PixelImage, x: number, y: number, channel: 0 | 1 | 2 | 3): number {
  const xi = clamp(x | 0, 0, source.width - 1);
  const yi = clamp(y | 0, 0, source.height - 1);
  return source.data[(yi * source.width + xi) * 4 + channel];
}

export function resizeNearest(source: PixelImage, targetWidth: number, targetHeight: number): PixelImage {
  const { w, h } = validateResize(targetWidth, targetHeight);
  if (source.data.length !== source.width * source.height * 4) {
    throw new Error('Неверное число каналов в исходном изображении.');
  }
  const xRatio = source.width / w;
  const yRatio = source.height / h;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const srcY = Math.floor((y + 0.5) * yRatio);
    for (let x = 0; x < w; x += 1) {
      const srcX = Math.floor((x + 0.5) * xRatio);
      const si = (clamp(srcY, 0, source.height - 1) * source.width + clamp(srcX, 0, source.width - 1)) * 4;
      const di = (y * w + x) * 4;
      data[di] = source.data[si];
      data[di + 1] = source.data[si + 1];
      data[di + 2] = source.data[si + 2];
      data[di + 3] = source.data[si + 3];
    }
  }
  return { width: w, height: h, data };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function resizeBilinear(source: PixelImage, targetWidth: number, targetHeight: number): PixelImage {
  const { w, h } = validateResize(targetWidth, targetHeight);
  if (source.data.length !== source.width * source.height * 4) {
    throw new Error('Неверное число каналов в исходном изображении.');
  }
  const xRatio = source.width / w;
  const yRatio = source.height / h;
  const data = new Uint8ClampedArray(w * h * 4);
  const srcMaxX = source.width - 1;
  const srcMaxY = source.height - 1;
  for (let y = 0; y < h; y += 1) {
    const srcY = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.floor(srcY);
    const y1 = y0 + 1;
    const ty = srcY - y0;
    const yy0 = clamp(y0, 0, srcMaxY);
    const yy1 = clamp(y1, 0, srcMaxY);
    for (let x = 0; x < w; x += 1) {
      const srcX = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.floor(srcX);
      const x1 = x0 + 1;
      const tx = srcX - x0;
      const xx0 = clamp(x0, 0, srcMaxX);
      const xx1 = clamp(x1, 0, srcMaxX);
      const di = (y * w + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const ch = c as 0 | 1 | 2 | 3;
        const v00 = sample(source, xx0, yy0, ch);
        const v10 = sample(source, xx1, yy0, ch);
        const v01 = sample(source, xx0, yy1, ch);
        const v11 = sample(source, xx1, yy1, ch);
        const top = lerp(v00, v10, tx);
        const bottom = lerp(v01, v11, tx);
        data[di + c] = Math.round(lerp(top, bottom, ty));
      }
    }
  }
  return { width: w, height: h, data };
}

export function resizeImage(source: PixelImage, options: ResizeOptions): PixelImage {
  const method = options.method ?? 'bilinear';
  if (method === 'bilinear') return resizeBilinear(source, options.width, options.height);
  if (method === 'nearest') return resizeNearest(source, options.width, options.height);
  throw new Error(`Неизвестный метод интерполяции: ${String(method)}`);
}

export const ZOOM_MIN = 12;
export const ZOOM_MAX = 300;

export function clampZoom(zoomPercent: number) {
  return clamp(Math.round(zoomPercent), ZOOM_MIN, ZOOM_MAX);
}

export function fitZoom(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  paddingPx = 50,
): number {
  if (imageWidth <= 0 || imageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return 100;
  }
  const availableW = Math.max(1, containerWidth - paddingPx * 2);
  const availableH = Math.max(1, containerHeight - paddingPx * 2);
  const zx = (availableW / imageWidth) * 100;
  const zy = (availableH / imageHeight) * 100;
  const z = Math.min(zx, zy);
  return clampZoom(z);
}

export function megapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}
