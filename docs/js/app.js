const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('canvas');
const statusBar = document.getElementById('statusBar') || document.getElementById('statusbar');
const ctx = canvas.getContext('2d');

const previewGray = document.getElementById('previewGray');
const previewR = document.getElementById('previewR');
const previewG = document.getElementById('previewG');
const previewB = document.getElementById('previewB');
const previewA = document.getElementById('previewA');

const chkGray = document.querySelector('input[data-channel="gray"]');
const chkR = document.querySelector('input[data-channel="r"]');
const chkG = document.querySelector('input[data-channel="g"]');
const chkB = document.querySelector('input[data-channel="b"]');
const chkA = document.querySelector('input[data-channel="a"]');

const btnPipette = document.getElementById('btnPipette');
const pipetteInfo = document.getElementById('pipetteInfo');

let originalImageData = null; // immutable source
let displayedImageData = null; // after channel toggles
let pipetteActive = false;

function setStatus(text){ if(statusBar) statusBar.textContent = text }

function fitCanvasToImage(img){ canvas.width = img.width; canvas.height = img.height; canvas.style.width = '100%'; }

function drawToCanvas(imgData){ if(!imgData) return; fitCanvasToImage(imgData); ctx.putImageData(imgData,0,0); const ch = chkGray && chkGray.checked ? 'gray' : `${chkR.checked? 'R':''}${chkG.checked? 'G':''}${chkB.checked? 'B':''}${chkA.checked?'+A':''}`; setStatus(`${imgData.width}×${imgData.height} — view: ${ch}`); }

async function loadImageData(imgData){ originalImageData = imgData; await updatePreviews(); renderDisplayedImage(); }

function downloadBlob(blob, name){ const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

document.getElementById('downloadPNG').addEventListener('click', ()=>{
  if(!displayedImageData){ setStatus('No image loaded'); return }
  const tmp = document.createElement('canvas'); tmp.width = displayedImageData.width; tmp.height = displayedImageData.height; const tctx = tmp.getContext('2d'); tctx.putImageData(displayedImageData,0,0); tmp.toBlob(b=>downloadBlob(b,'image.png'),'image/png');
});

document.getElementById('downloadJPG').addEventListener('click', ()=>{
  if(!displayedImageData){ setStatus('No image loaded'); return }
  const tmp = document.createElement('canvas'); tmp.width = displayedImageData.width; tmp.height = displayedImageData.height; const tctx = tmp.getContext('2d'); tctx.putImageData(displayedImageData,0,0); tmp.toBlob(b=>downloadBlob(b,'image.jpg'),'image/jpeg',0.9);
});

document.getElementById('downloadGB7').addEventListener('click', ()=>{
  if(!displayedImageData){ setStatus('No image loaded'); return }
  const hasMask = chkA && chkA.checked;
  const buf = GB7.encode(displayedImageData, {hasMask});
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

async function updatePreviews(){
  if(!originalImageData) return;
  try{
    const bmp = await createImageBitmap(originalImageData);
    const previews = [ {canvas:previewGray, mode:'gray'}, {canvas:previewR, mode:'r'}, {canvas:previewG, mode:'g'}, {canvas:previewB, mode:'b'}, {canvas:previewA, mode:'a'} ];
    previews.forEach(p=>{
      const c = p.canvas; const cctx = c.getContext('2d'); cctx.clearRect(0,0,c.width,c.height); cctx.drawImage(bmp,0,0,c.width,c.height);
      try{
        const id = cctx.getImageData(0,0,c.width,c.height);
        for(let i=0;i<id.data.length;i+=4){
          const r = id.data[i], g=id.data[i+1], b=id.data[i+2], a=id.data[i+3];
          let v = 0;
          if(p.mode==='gray') v = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
          else if(p.mode==='r') v = r;
          else if(p.mode==='g') v = g;
          else if(p.mode==='b') v = b;
          else if(p.mode==='a') v = a;
          id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255;
        }
        cctx.putImageData(id,0,0);
      }catch(e){ /* ignore on some browsers */ }
    });
  }catch(e){ console.warn('preview error',e) }
}

function renderDisplayedImage(){
  if(!originalImageData) return;
  const w = originalImageData.width, h = originalImageData.height;
  const out = new ImageData(w,h);
  const od = originalImageData.data, nd = out.data;
  const grayMode = chkGray && chkGray.checked;
  const rOn = chkR.checked, gOn = chkG.checked, bOn = chkB.checked, aOn = chkA.checked;

  for(let i=0;i<od.length;i+=4){
    const r = od[i], g = od[i+1], b = od[i+2], a = od[i+3];
    if(grayMode){
      const lum = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
      nd[i]=nd[i+1]=nd[i+2]=lum; nd[i+3] = aOn ? a : 255;
    } else {
      if(!rOn && !gOn && !bOn){
        if(aOn){ const val = a; nd[i]=nd[i+1]=nd[i+2]=val; nd[i+3]=255; }
        else { nd[i]=nd[i+1]=nd[i+2]=0; nd[i+3]=255; }
      } else {
        nd[i]   = rOn ? r : 0;
        nd[i+1] = gOn ? g : 0;
        nd[i+2] = bOn ? b : 0;
        nd[i+3] = aOn ? a : 255;
      }
    }
  }
  displayedImageData = out; drawToCanvas(displayedImageData);
}

// pipette / eyedropper
btnPipette.addEventListener('click', ()=>{
  pipetteActive = !pipetteActive; btnPipette.classList.toggle('active', pipetteActive); canvas.style.cursor = pipetteActive ? 'crosshair' : 'default'; setStatus('Пипетка: '+(pipetteActive? 'включена':'выключена'));
});

canvas.addEventListener('click', (ev)=>{
  if(!pipetteActive) return;
  if(!displayedImageData) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
  const x = Math.floor((ev.clientX - rect.left) * scaleX);
  const y = Math.floor((ev.clientY - rect.top) * scaleY);
  if(x<0 || y<0 || x>=displayedImageData.width || y>=displayedImageData.height) return;
  const idx = (y*displayedImageData.width + x)*4;
  const r = displayedImageData.data[idx], g = displayedImageData.data[idx+1], b = displayedImageData.data[idx+2], a = displayedImageData.data[idx+3];
  const lab = rgbToLab(r,g,b);
  pipetteInfo.style.display='block';
  pipetteInfo.innerHTML = `X:${x} Y:${y}<br>R:${r} G:${g} B:${b} A:${a}<br>CIELAB: L=${lab.L.toFixed(2)} a=${lab.a.toFixed(2)} b=${lab.b.toFixed(2)}`;
});

// helper: convert rgb 0..255 to CIELAB
function srgbToLinear(v){ return v<=0.04045? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
function rgbToXyz(r,g,b){ const R = srgbToLinear(r/255), G = srgbToLinear(g/255), B = srgbToLinear(b/255); const X = (R*0.4124564 + G*0.3575761 + B*0.1804375)*100; const Y = (R*0.2126729 + G*0.7151522 + B*0.0721750)*100; const Z = (R*0.0193339 + G*0.1191920 + B*0.9503041)*100; return {X,Y,Z}; }
function xyzToLab(X,Y,Z){ const Xn=95.047, Yn=100.0, Zn=108.883; let x = X/Xn, y=Y/Yn, z=Z/Zn; function f(t){ return t>0.008856? Math.cbrt(t) : (7.787*t)+(16/116); } const fx=f(x), fy=f(y), fz=f(z); const L = (116*fy)-16; const a = 500*(fx-fy); const b = 200*(fy-fz); return {L,a,b}; }
function rgbToLab(r,g,b){ const xyz = rgbToXyz(r,g,b); return xyzToLab(xyz.X, xyz.Y, xyz.Z); }

// Simple generators (use loadImageData to set original)
function generateGradient(w,h){ const img = new ImageData(w,h); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const v = Math.round((x/(w-1))*255); const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255 }} loadImageData(img); }
function generateChecker(w,h){ const img=new ImageData(w,h); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const v = ((Math.floor(x/16)+Math.floor(y/16))%2)?200:50; const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255 }} loadImageData(img); }
function generateMasked(w,h){ const img=new ImageData(w,h); const cx=w/2, cy=h/2; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const dx=x-cx, dy=y-cy; const r=Math.sqrt(dx*dx+dy*dy); const inside = r<Math.min(w,h)/3; const v = inside?220:30; const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]= inside?255:0 }} loadImageData(img); }

// wire up file input
fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return; const name = f.name.toLowerCase();
  if(name.endsWith('.gb7')){
    const ab = await f.arrayBuffer(); try{ const res = GB7.decode(ab); await loadImageData(res.imageData); } catch(err){ setStatus('Error: '+err.message) }
  } else {
    const img = await createImageBitmap(f);
    const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height; const tctx = tmp.getContext('2d'); tctx.drawImage(img,0,0); const imgData = tctx.getImageData(0,0,img.width,img.height); await loadImageData(imgData);
  }
});

// checkbox listeners
[chkGray, chkR, chkG, chkB, chkA].forEach(el=>{ if(!el) return; el.addEventListener('change', ()=>{ renderDisplayedImage(); }); });

// clicking previews toggles relevant checkbox
[[previewR,'r'],[previewG,'g'],[previewB,'b'],[previewA,'a'],[previewGray,'gray']].forEach(([pc,mode])=>{
  if(!pc) return; pc.addEventListener('click', ()=>{ const cb = document.querySelector(`input[data-channel="${mode}"]`); if(cb){ cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } });
});

// Make responsive canvas on resize
window.addEventListener('resize', ()=>{ if(displayedImageData) drawToCanvas(displayedImageData) });
