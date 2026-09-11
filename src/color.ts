import type { PixelImage } from './gb7';

export type Channel = 'gray' | 'red' | 'green' | 'blue' | 'alpha';

export function renderChannels(image: PixelImage, channels: Set<Channel>, grayscale: boolean): PixelImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    const onlyAlpha = channels.has('alpha') && [...channels].every((channel) => channel === 'alpha');
    if (onlyAlpha) data.set([alpha, alpha, alpha, 255], i);
    else if (grayscale) {
      const value = channels.has('gray') ? image.data[i] : 0;
      data.set([value, value, value, channels.has('alpha') ? alpha : 255], i);
    } else {
      data.set([channels.has('red') ? image.data[i] : 0, channels.has('green') ? image.data[i + 1] : 0, channels.has('blue') ? image.data[i + 2] : 0, channels.has('alpha') ? alpha : 255], i);
    }
  }
  return { width: image.width, height: image.height, data };
}

export function toLab(red: number, green: number, blue: number) {
  const linear = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(red), g = linear(green), b = linear(blue);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
