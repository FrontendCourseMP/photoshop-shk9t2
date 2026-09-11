/** GrayBit-7 codec. The 7 low bits store luminance, bit 7 stores opacity. */
export type PixelImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type Gb7Metadata = {
  hasMask: boolean;
  version: number;
};

const HEADER_BYTES = 12;
const SIGNATURE = [0x47, 0x42, 0x37, 0x1d];

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function validateDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new Error('GB7 поддерживает размеры от 1 до 65535 пикселей по каждой стороне.');
  }
}

export function decodeGb7(buffer: ArrayBuffer): PixelImage & { metadata: Gb7Metadata } {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_BYTES) throw new Error('Файл GB7 слишком короткий: отсутствует заголовок.');
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('Это не файл GB7: неверная сигнатура.');
  if (bytes[4] !== 1) throw new Error(`Версия GB7 ${bytes[4]} пока не поддерживается.`);
  if ((bytes[5] & 0xfe) !== 0) throw new Error('В GB7 установлены неизвестные флаги.');
  if (bytes[10] !== 0 || bytes[11] !== 0) throw new Error('Зарезервированные байты GB7 должны быть нулевыми.');

  const width = readUint16BE(bytes, 6);
  const height = readUint16BE(bytes, 8);
  validateDimensions(width, height);
  const pixels = width * height;
  if (bytes.length !== HEADER_BYTES + pixels) throw new Error(`Некорректный размер GB7: ожидалось ${HEADER_BYTES + pixels} байт, получено ${bytes.length}.`);

  const hasMask = (bytes[5] & 1) === 1;
  const data = new Uint8ClampedArray(pixels * 4);
  for (let source = HEADER_BYTES, pixel = 0; pixel < pixels; source += 1, pixel += 1) {
    const value = bytes[source];
    const gray = Math.round(((value & 0x7f) * 255) / 127);
    const target = pixel * 4;
    data[target] = gray;
    data[target + 1] = gray;
    data[target + 2] = gray;
    data[target + 3] = hasMask ? ((value & 0x80) === 0x80 ? 255 : 0) : 255;
  }
  return { width, height, data, metadata: { hasMask, version: 1 } };
}

export function encodeGb7(image: PixelImage): Uint8Array {
  validateDimensions(image.width, image.height);
  if (image.data.length !== image.width * image.height * 4) throw new Error('Неверное число каналов в изображении.');
  let hasMask = false;
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] < 255) { hasMask = true; break; }
  }
  const bytes = new Uint8Array(HEADER_BYTES + image.width * image.height);
  bytes.set(SIGNATURE, 0);
  bytes[4] = 1;
  bytes[5] = hasMask ? 1 : 0;
  bytes[6] = image.width >> 8;
  bytes[7] = image.width & 0xff;
  bytes[8] = image.height >> 8;
  bytes[9] = image.height & 0xff;

  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const source = pixel * 4;
    const luminance = Math.round(0.2126 * image.data[source] + 0.7152 * image.data[source + 1] + 0.0722 * image.data[source + 2]);
    const gray7 = Math.round((luminance * 127) / 255);
    const opaque = image.data[source + 3] >= 128;
    bytes[HEADER_BYTES + pixel] = gray7 | (hasMask && opaque ? 0x80 : 0);
  }
  return bytes;
}
