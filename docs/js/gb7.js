/* gb7.js
   Encoder/decoder for GrayBit-7 (GB7) simple format.
*/
(function(global){
  function readUInt16BE(bytes, off){ return (bytes[off]<<8) | bytes[off+1]; }
  function writeUInt16BE(v, bytes, off){ bytes[off]= (v>>8)&0xFF; bytes[off+1]= v&0xFF }

  function decodeGB7(arrayBuffer){
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 12) throw new Error('File too small');
    if (bytes[0]!==0x47 || bytes[1]!==0x42 || bytes[2]!==0x37 || bytes[3]!==0x1D) throw new Error('Invalid signature');
    const version = bytes[4];
    const flags = bytes[5];
    const hasMask = (flags & 0x01) === 1;
    const width = readUInt16BE(bytes,6);
    const height = readUInt16BE(bytes,8);
    // bytes[10..11] reserved
    const expected = 12 + width*height;
    if (bytes.length < expected) throw new Error('Unexpected EOF');
    const img = new ImageData(width, height);
    let p = 12;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const b = bytes[p++];
        const gray7 = b & 0x7F; // 0..127
        // scale to 0..255
        const g = Math.round((gray7/127)*255);
        const maskBit = (b & 0x80) ? 1 : 0;
        const idx = (y*width + x)*4;
        img.data[idx] = g;
        img.data[idx+1] = g;
        img.data[idx+2] = g;
        img.data[idx+3] = hasMask ? (maskBit?255:0) : 255;
      }
    }
    return {imageData: img, meta: {version, flags, width, height}};
  }

  function encodeGB7(imageData, options){
    options = options || {};
    const width = imageData.width, height = imageData.height;
    const hasMask = !!options.hasMask;
    const out = new Uint8Array(12 + width*height);
    out[0]=0x47; out[1]=0x42; out[2]=0x37; out[3]=0x1D;
    out[4]=0x01; // version
    out[5]= hasMask?1:0;
    writeUInt16BE(width, out, 6);
    writeUInt16BE(height, out, 8);
    out[10]=0; out[11]=0;
    let p=12;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const idx = (y*width + x)*4;
        const r = imageData.data[idx];
        const g = imageData.data[idx+1];
        const b = imageData.data[idx+2];
        const a = imageData.data[idx+3];
        // convert to grayscale
        const lum = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
        const gray7 = Math.round((lum/255)*127) & 0x7F;
        const maskBit = hasMask ? ((a>127)?1:0) : 0;
        out[p++] = (maskBit?0x80:0) | gray7;
      }
    }
    return out.buffer;
  }

  global.GB7 = {decode: decodeGB7, encode: encodeGB7};
})(window);
