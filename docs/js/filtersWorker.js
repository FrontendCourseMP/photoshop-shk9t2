self.onmessage = function(e){
  const msg = e.data;
  if(!msg || msg.cmd !== 'process') return;
  const w = msg.width, h = msg.height;
  const inBuf = msg.buffer;
  const kernel = msg.kernel || [0,0,0,0,1,0,0,0,0];
  const channels = msg.channels || {r:true,g:true,b:true,a:false};
  const edge = msg.edgeMode || 'copy';
  const src = new Uint8ClampedArray(inBuf);
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  // compute divisor (sum) — if zero, use 1
  let sum = 0; for(let i=0;i<9;i++) sum += kernel[i];
  const divisor = (Math.abs(sum) > 1e-8) ? sum : 1;

  function sample(px,py,ci){
    if(px<0 || py<0 || px>=w || py>=h){
      if(edge === 'copy'){
        const cx = Math.min(w-1, Math.max(0, px));
        const cy = Math.min(h-1, Math.max(0, py));
        return src[(cy*w + cx)*4 + ci];
      } else if(edge === 'black'){
        return 0;
      } else if(edge === 'white'){
        return 255;
      }
    }
    return src[(py*w + px)*4 + ci];
  }

  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const base = (y*w + x)*4;
      for(let c=0;c<4;c++){
        const apply = (c===0 && channels.r) || (c===1 && channels.g) || (c===2 && channels.b) || (c===3 && channels.a);
        if(!apply){ out[base + c] = src[base + c]; continue; }
        let acc = 0; let k=0;
        for(let ky=-1; ky<=1; ky++){
          for(let kx=-1; kx<=1; kx++){
            const v = sample(x + kx, y + ky, c);
            acc += v * kernel[k++];
          }
        }
        let val = acc / divisor;
        val = Math.round(val);
        if(val < 0) val = 0; if(val > 255) val = 255;
        out[base + c] = val;
      }
    }
  }

  // Transfer result buffer back (include action to distinguish preview/apply)
  self.postMessage({width:w, height:h, buffer: out.buffer, requestId: msg.requestId, action: msg.action}, [out.buffer]);
};
