import type { PixelImage } from './gb7';

export type PaddingMode = 'black' | 'white' | 'replicate';

/** Внутренний канал для фильтрации: 'gray' означает R=G=B одновременно (для grayscale-изображений) */
export type KernelChannel = 'red' | 'green' | 'blue' | 'alpha' | 'gray';

export type Kernel3x3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const PADDING_MODES: { value: PaddingMode; label: string }[] = [
  { value: 'black', label: 'Чёрный (0)' },
  { value: 'white', label: 'Белый (255)' },
  { value: 'replicate', label: 'Копирование края' },
];

export const KERNEL_OFFSETS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0], [0,  0], [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

export type KernelPreset = 'identity' | 'sharpen' | 'gauss3' | 'box' | 'prewittX' | 'prewittY';

export const KERNEL_PRESETS: { value: KernelPreset; label: string; kernel: Kernel3x3 }[] = [
  {
    value: 'identity',
    label: 'Тождественное отображение',
    kernel: [
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ],
  },
  {
    value: 'sharpen',
    label: 'Повышение резкости',
    kernel: [
       0, -1,  0,
      -1,  5, -1,
       0, -1,  0,
    ],
  },
  {
    value: 'gauss3',
    label: 'Фильтр Гаусса 3×3',
    kernel: [
      1, 2, 1,
      2, 4, 2,
      1, 2, 1,
    ],
  },
  {
    value: 'box',
    label: 'Прямоугольное размытие',
    kernel: [
      1, 1, 1,
      1, 1, 1,
      1, 1, 1,
    ],
  },
  {
    value: 'prewittX',
    label: 'Оператор Прюитта (по X)',
    kernel: [
      -1, 0, 1,
      -1, 0, 1,
      -1, 0, 1,
    ],
  },
  {
    value: 'prewittY',
    label: 'Оператор Прюитта (по Y)',
    kernel: [
      -1, -1, -1,
       0,  0,  0,
       1,  1,  1,
    ],
  },
];

export const DEFAULT_KERNEL: Kernel3x3 = [...KERNEL_PRESETS[0].kernel] as Kernel3x3;

export const CHANNEL_OFFSETS: Record<Exclude<KernelChannel, 'gray'>, 0 | 1 | 2 | 3> = {
  red: 0,
  green: 1,
  blue: 2,
  alpha: 3,
};

export const CHANNEL_LABELS: Record<KernelChannel, string> = {
  gray: 'Y',
  red: 'R',
  green: 'G',
  blue: 'B',
  alpha: 'A',
};

export const CHANNEL_TITLES: Record<KernelChannel, string> = {
  gray: 'Яркость (Gray)',
  red: 'Красный',
  green: 'Зелёный',
  blue: 'Синий',
  alpha: 'Альфа',
};

/** Преобразует набор KernelChannel (включая 'gray') в множество реальных RGBA-офсетов 0..3.
 *  Для 'gray' возвращаются 0, 1, 2 одновременно (R=G=B обработать вместе). */
export function resolveActiveChannels(channels: ReadonlySet<KernelChannel>): Set<0 | 1 | 2 | 3> {
  const active = new Set<0 | 1 | 2 | 3>();
  if (channels.has('red')) active.add(0);
  if (channels.has('green')) active.add(1);
  if (channels.has('blue')) active.add(2);
  if (channels.has('alpha')) active.add(3);
  if (channels.has('gray')) {
    active.add(0);
    active.add(1);
    active.add(2);
  }
  return active;
}

function validatePixelImage(image: PixelImage) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) {
    throw new Error('Некорректные размеры изображения.');
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new Error('Неверное число каналов: ожидается RGBA (4 байта на пиксель).');
  }
}

export function normalizeKernel(raw: number[]): { kernel: number[]; sum: number; absSum: number } {
  if (raw.length !== 9) throw new Error('Ядро должно быть 3×3 (9 чисел).');
  const kernel = raw.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('Ядро содержит нечисловые значения.');
    return n;
  });
  const sum = kernel.reduce((a, b) => a + b, 0);
  const absSum = kernel.reduce((a, b) => a + Math.abs(b), 0);
  return { kernel, sum, absSum };
}

function padSample(src: Uint8ClampedArray, w: number, h: number, x: number, y: number, mode: PaddingMode, ch: 0 | 1 | 2 | 3): number {
  let sx = x;
  let sy = y;
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
    switch (mode) {
      case 'black': return 0;
      case 'white': return 255;
      case 'replicate':
        sx = Math.max(0, Math.min(w - 1, sx));
        sy = Math.max(0, Math.min(h - 1, sy));
        break;
    }
  }
  return src[(sy * w + sx) * 4 + ch];
}

export function applyKernelSync(
  source: PixelImage,
  rawKernel: number[],
  options: {
    channels: ReadonlySet<KernelChannel>;
    padding: PaddingMode;
  }
): PixelImage {
  validatePixelImage(source);
  const { kernel, sum, absSum } = normalizeKernel(rawKernel);
  if (options.channels.size === 0) {
    return { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
  }

  const w = source.width;
  const h = source.height;
  const src = source.data;
  const dst = new Uint8ClampedArray(src.length);
  const active = resolveActiveChannels(options.channels);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const base = (y * w + x) * 4;
      for (let ch = 0; ch < 4; ch += 1) {
        if (!active.has(ch as 0 | 1 | 2 | 3)) {
          dst[base + ch] = src[base + ch];
          continue;
        }
        let acc = 0;
        for (let k = 0; k < 9; k += 1) {
          const [dx, dy] = KERNEL_OFFSETS[k];
          const sample = padSample(src, w, h, x + dx, y + dy, options.padding, ch as 0 | 1 | 2 | 3);
          acc += sample * kernel[k];
        }
        let result: number;
        if (sum !== 0) {
          result = acc / sum;
        } else if (absSum !== 0) {
          result = 128 + acc / absSum * 127;
        } else {
          result = src[base + ch];
        }
        if (result < 0) result = 0;
        else if (result > 255) result = 255;
        dst[base + ch] = Math.round(result);
      }
    }
  }

  return { width: w, height: h, data: dst };
}

const YIELD_EVERY_ROWS = 16;

export async function applyKernel(
  source: PixelImage,
  rawKernel: number[],
  options: {
    channels: ReadonlySet<KernelChannel>;
    padding: PaddingMode;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<PixelImage> {
  validatePixelImage(source);
  const { kernel, sum, absSum } = normalizeKernel(rawKernel);
  if (options.channels.size === 0) {
    return { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
  }
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const w = source.width;
  const h = source.height;
  const src = source.data;
  const dst = new Uint8ClampedArray(src.length);
  const active = resolveActiveChannels(options.channels);
  const total = h;
  let reported = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const base = (y * w + x) * 4;
      for (let ch = 0; ch < 4; ch += 1) {
        if (!active.has(ch as 0 | 1 | 2 | 3)) {
          dst[base + ch] = src[base + ch];
          continue;
        }
        let acc = 0;
        for (let k = 0; k < 9; k += 1) {
          const [dx, dy] = KERNEL_OFFSETS[k];
          const sample = padSample(src, w, h, x + dx, y + dy, options.padding, ch as 0 | 1 | 2 | 3);
          acc += sample * kernel[k];
        }
        let result: number;
        if (sum !== 0) {
          result = acc / sum;
        } else if (absSum !== 0) {
          result = 128 + (acc / absSum) * 127;
        } else {
          result = src[base + ch];
        }
        if (result < 0) result = 0;
        else if (result > 255) result = 255;
        dst[base + ch] = Math.round(result);
      }
    }
    if (y - reported + 1 >= YIELD_EVERY_ROWS || y === h - 1) {
      reported = y + 1;
      options.onProgress?.(reported, total);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    }
  }

  return { width: w, height: h, data: dst };
}
