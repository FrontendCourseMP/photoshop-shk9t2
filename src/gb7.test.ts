import { describe, expect, it } from 'vitest';
import { decodeGb7, encodeGb7 } from './gb7';

describe('GrayBit-7 codec', () => {
  it('writes a valid big-endian header and preserves the optional mask', () => {
    const source = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 0]) };
    const encoded = encodeGb7(source);
    expect([...encoded.slice(0, 12)]).toEqual([0x47, 0x42, 0x37, 0x1d, 1, 1, 0, 2, 0, 1, 0, 0]);
    expect([...encoded.slice(12)]).toEqual([0x80, 0x7f]);
    const decoded = decodeGb7(encoded.buffer as ArrayBuffer);
    expect(decoded.metadata.hasMask).toBe(true);
    expect([...decoded.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 0]);
  });

  it('rejects malformed files', () => {
    expect(() => decodeGb7(new ArrayBuffer(12))).toThrow('сигнатура');
    expect(() => decodeGb7(new Uint8Array([0x47, 0x42, 0x37, 0x1d, 1, 0, 0, 1, 0, 1, 0, 0]).buffer)).toThrow('размер');
  });
});
