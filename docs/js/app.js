const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('canvas');
const statusBar = document.getElementById('statusBar') || document.getElementById('statusbar');
const ctx = canvas.getContext('2d');

let currentImage = null;

function setStatus(text){ if(statusBar) statusBar.textContent = text }

function fitCanvasToImage(img){ canvas.width = img.width; canvas.height = img.height; canvas.style.width = '100%'; }

function drawImageData(imgData){ fitCanvasToImage(imgData); ctx.putImageData(imgData,0,0); setStatus(`${imgData.width}×${imgData.height} — 7-bit gray`); }

fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const name = f.name.toLowerCase();
  if(name.endsWith('.gb7')){
    const ab = await f.arrayBuffer();
    try{
      const res = GB7.decode(ab);
      currentImage = res.imageData;
      drawImageData(currentImage);
    }catch(err){ setStatus('Error: '+err.message) }
  } else {
    const img = await createImageBitmap(f);
    // draw to temp canvas to get ImageData
    const tmp = new OffscreenCanvas(img.width,img.height);
    const tctx = tmp.getContext('2d');
    tctx.drawImage(img,0,0);
    const imgData = tctx.getImageData(0,0,img.width,img.height);
    currentImage = imgData;
    // ensure alpha fully opaque
    drawImageData(currentImage);
  }
});

function downloadBlob(blob, name){ const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

document.getElementById('downloadPNG').addEventListener('click', ()=>{
  if(!currentImage){ setStatus('No image loaded'); return }
  const tmp = new OffscreenCanvas(currentImage.width,currentImage.height);
  const tctx = tmp.getContext('2d'); tctx.putImageData(currentImage,0,0);
  tmp.convertToBlob({type:'image/png'}).then(b=>downloadBlob(b,'image.png'));
});

document.getElementById('downloadJPG').addEventListener('click', ()=>{
  if(!currentImage){ setStatus('No image loaded'); return }
  const tmp = new OffscreenCanvas(currentImage.width,currentImage.height);
  const tctx = tmp.getContext('2d'); tctx.putImageData(currentImage,0,0);
  tmp.convertToBlob({type:'image/jpeg', quality:0.9}).then(b=>downloadBlob(b,'image.jpg'));
});

document.getElementById('downloadGB7').addEventListener('click', ()=>{
  if(!currentImage){ setStatus('No image loaded'); return }
  const buf = GB7.encode(currentImage, {hasMask:true});
  const blob = new Blob([buf], {type:'application/octet-stream'});
  downloadBlob(blob, 'image.gb7');
});

// Simple test generators
document.getElementById('generateBtn').addEventListener('click', ()=>{
  const sel = document.getElementById('preset').value;
  if(sel==='gradient') generateGradient(512,256);
  else if(sel==='checker') generateChecker(256,256);
  else generateMasked(200,200);
});

function generateGradient(w,h){ const img = new ImageData(w,h); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const v = Math.round((x/(w-1))*255); const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255 }} currentImage=img; drawImageData(img); }
function generateChecker(w,h){ const img=new ImageData(w,h); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const v = ((Math.floor(x/16)+Math.floor(y/16))%2)?200:50; const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255 }} currentImage=img; drawImageData(img); }
function generateMasked(w,h){ const img=new ImageData(w,h); const cx=w/2, cy=h/2; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const dx=x-cx, dy=y-cy; const r=Math.sqrt(dx*dx+dy*dy); const inside = r<Math.min(w,h)/3; const v = inside?220:30; const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]= inside?255:0 }} currentImage=img; drawImageData(img); }

// Make responsive canvas on resize
window.addEventListener('resize', ()=>{ if(currentImage) drawImageData(currentImage) });
