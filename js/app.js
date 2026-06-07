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
let originalIsGB7 = false;

function setStatus(text){ if(statusBar) statusBar.textContent = text }

function fitCanvasToImage(img){ canvas.width = img.width; canvas.height = img.height; canvas.style.width = '100%'; }

function drawToCanvas(imgData){ if(!imgData) return; fitCanvasToImage(imgData); ctx.putImageData(imgData,0,0); const ch = chkGray && chkGray.checked ? 'gray' : `${chkR.checked? 'R':''}${chkG.checked? 'G':''}${chkB.checked? 'B':''}${chkA.checked?'+A':''}`; setStatus(`${imgData.width}×${imgData.height} — view: ${ch}`); }

async function loadImageData(imgData, options){ options = options || {}; originalIsGB7 = !!options.isGB7; originalImageData = imgData; // reset levels when new image loaded
  initLevelsDefaults();
  // compute initial scale to fit viewport with 50px padding
  try{
    const availW = Math.max(100, Math.floor(window.innerWidth - 100));
    const availH = Math.max(100, Math.floor(window.innerHeight - 200));
    let s = Math.min(availW / imgData.width, availH / imgData.height);
    s = clampScale(s);
    currentScale = s;
    originalAspect = imgData.width / imgData.height;
  }catch(e){ currentScale = 1; }
  updateScaleDisplay();
  await updatePreviews(); renderDisplayedImage(); }

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
    const ab = await f.arrayBuffer(); try{ const res = GB7.decode(ab); await loadImageData(res.imageData, {isGB7:true}); } catch(err){ setStatus('Error: '+err.message) }
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

/* Levels tool: histogram, input levels and preview/apply */
const btnLevels = document.getElementById('btnLevels');
const levelsDialog = document.getElementById('levelsDialog');
const histCanvas = document.getElementById('histogramCanvas');
const histCtx = histCanvas && histCanvas.getContext ? histCanvas.getContext('2d') : null;
const levelBlackEl = document.getElementById('levelBlack');
const levelWhiteEl = document.getElementById('levelWhite');
const levelGammaEl = document.getElementById('levelGamma');
const levelBlackVal = document.getElementById('levelBlackVal');
const levelWhiteVal = document.getElementById('levelWhiteVal');
const levelGammaVal = document.getElementById('levelGammaVal');
const levelsChannelEl = document.getElementById('levelsChannel');
const levelsPreviewEl = document.getElementById('levelsPreview');
const levelsLogEl = document.getElementById('levelsLog');
const levelsResetBtn = document.getElementById('levelsReset');
const levelsCancelBtn = document.getElementById('levelsCancel');
const levelsApplyBtn = document.getElementById('levelsApply');

let levelsMap = null; // per-channel settings
let rafLevels = null;

// Scaling
const scaleRange = document.getElementById('scaleRange');
const scaleVal = document.getElementById('scaleVal');
const btnScale = document.getElementById('btnScale');
const scaleDialog = document.getElementById('scaleDialog');
const origSizeEl = document.getElementById('origSize');
const origMPEl = document.getElementById('origMP');
const scaleModeEls = document.getElementsByName('scaleMode');
const scaleWidthEl = document.getElementById('scaleWidth');
const scaleHeightEl = document.getElementById('scaleHeight');
const keepAspectEl = document.getElementById('keepAspect');
const scaleAlgoEl = document.getElementById('scaleAlgo');
const scaleResetBtn = document.getElementById('scaleReset');
const scaleCancelBtn = document.getElementById('scaleCancel');
const scaleApplyBtn = document.getElementById('scaleApply');

let currentScale = 1.0; // percent as decimal
let interpolationMethod = 'bilinear';

function updateScaleDisplay(){ if(scaleVal) scaleVal.textContent = Math.round(currentScale*100)+'%'; if(scaleRange) scaleRange.value = Math.round(currentScale*100); }

if(scaleRange){ scaleRange.addEventListener('input', (e)=>{ currentScale = Number(e.target.value)/100; updateScaleDisplay(); if(displayedImageData) drawToCanvas(displayedImageData); }); }

function clampScale(s){ return Math.max(0.12, Math.min(3.0, s)); }

// Nearest-neighbor interpolation
function nearestNeighborScale(src, newW, newH){
  const sw = src.width, sh = src.height; const srcData = src.data;
  const out = new ImageData(newW, newH); const dst = out.data;
  const xRatio = sw / newW; const yRatio = sh / newH;
  for(let y=0;y<newH;y++){
    const sy = Math.min(sh-1, Math.floor(y * yRatio));
    for(let x=0;x<newW;x++){
      const sx = Math.min(sw-1, Math.floor(x * xRatio));
      const si = (sy*sw + sx)*4; const di = (y*newW + x)*4;
      dst[di]=srcData[si]; dst[di+1]=srcData[si+1]; dst[di+2]=srcData[si+2]; dst[di+3]=srcData[si+3];
    }
  }
  return out;
}

// Bilinear interpolation
function bilinearScale(src, newW, newH){
  const sw = src.width, sh = src.height; const s = src.data;
  const out = new ImageData(newW, newH); const d = out.data;
  const xScale = (sw-1) / (newW-1 || 1);
  const yScale = (sh-1) / (newH-1 || 1);
  for(let j=0;j<newH;j++){
    const gy = j * yScale; const y0 = Math.floor(gy); const y1 = Math.min(sh-1, y0+1); const dy = gy - y0;
    for(let i=0;i<newW;i++){
      const gx = i * xScale; const x0 = Math.floor(gx); const x1 = Math.min(sw-1, x0+1); const dx = gx - x0;
      const i00 = (y0*sw + x0)*4; const i10 = (y0*sw + x1)*4; const i01 = (y1*sw + x0)*4; const i11 = (y1*sw + x1)*4;
      for(let c=0;c<4;c++){
        const v00 = s[i00+c], v10 = s[i10+c], v01 = s[i01+c], v11 = s[i11+c];
        const v0 = v00 + (v10 - v00) * dx;
        const v1 = v01 + (v11 - v01) * dx;
        const val = v0 + (v1 - v0) * dy;
        d[(j*newW + i)*4 + c] = Math.round(val);
      }
    }
  }
  return out;
}

function scaleImageData(srcImageData, newW, newH, method){
  if(method === 'nearest') return nearestNeighborScale(srcImageData, newW, newH);
  return bilinearScale(srcImageData, newW, newH);
}

// modify drawToCanvas to support scaling
function drawToCanvas(imgData){ if(!imgData) return; const scale = currentScale || 1; if(Math.abs(scale-1)<1e-6){ fitCanvasToImage(imgData); ctx.putImageData(imgData,0,0); } else { const newW = Math.max(1, Math.round(imgData.width * scale)); const newH = Math.max(1, Math.round(imgData.height * scale)); const scaled = scaleImageData(imgData, newW, newH, interpolationMethod); fitCanvasToImage(scaled); ctx.putImageData(scaled,0,0); } const ch = chkGray && chkGray.checked ? 'gray' : `${chkR.checked? 'R':''}${chkG.checked? 'G':''}${chkB.checked? 'B':''}${chkA.checked?'+A':''}`; setStatus(`${imgData.width}×${imgData.height} — view: ${ch} — scale ${Math.round(currentScale*100)}%`); }

// Scale dialog wiring
if(btnScale){ btnScale.addEventListener('click', ()=>{
  if(!originalImageData){ setStatus('Загрузите изображение перед изменением размера'); return }
  const w = originalImageData.width, h = originalImageData.height; origSizeEl.textContent = w+'×'+h; origMPEl.textContent = ((w*h)/1e6).toFixed(3);
  // default percent mode
  document.querySelector('input[name="scaleMode"][value="percent"]').checked = true;
  // show percent values when in percent mode
  scaleWidthEl.value = Math.round((currentScale||1) * 100);
  scaleHeightEl.value = Math.round((currentScale||1) * 100);
  scaleAlgoEl.value = interpolationMethod;
  if(scaleDialog && scaleDialog.showModal) scaleDialog.showModal();
}); }

function getScaleMode(){ const v = document.querySelector('input[name="scaleMode"]:checked'); return v? v.value : 'percent'; }

function scaleModeChanged(){ const mode = getScaleMode(); if(mode==='percent'){ // interpret width/height as percent relative to original
    scaleWidthEl.value = Math.round((currentScale||1) * 100);
    scaleHeightEl.value = Math.round((currentScale||1) * 100);
  } else { scaleWidthEl.value = originalImageData.width; scaleHeightEl.value = originalImageData.height; }
}

Array.from(scaleModeEls||[]).forEach(el=> el.addEventListener('change', scaleModeChanged));

// keep aspect behavior
let originalAspect = 1;

function updateWHFromInputs(changed){ if(!originalImageData) return; const mode = getScaleMode(); if(mode==='percent'){ // width/height fields are pixel values interpreted as percent of original? We will keep them as pixels for editing
  }
  if(keepAspectEl && keepAspectEl.checked){ if(changed==='w'){ const newW = Number(scaleWidthEl.value); const newH = Math.round(newW / originalAspect); scaleHeightEl.value = newH; } else if(changed==='h'){ const newH = Number(scaleHeightEl.value); const newW = Math.round(newH * originalAspect); scaleWidthEl.value = newW; } }
}

if(scaleWidthEl) scaleWidthEl.addEventListener('input', ()=> updateWHFromInputs('w'));
if(scaleHeightEl) scaleHeightEl.addEventListener('input', ()=> updateWHFromInputs('h'));

if(scaleResetBtn) scaleResetBtn.addEventListener('click', ()=>{ if(!originalImageData) return; scaleModeChanged(); scaleAlgoEl.value = 'bilinear'; keepAspectEl.checked = true; });
if(scaleCancelBtn) scaleCancelBtn.addEventListener('click', ()=>{ if(scaleDialog) scaleDialog.close(); });
if(scaleApplyBtn) scaleApplyBtn.addEventListener('click', ()=>{
  if(!originalImageData) return; const mode = getScaleMode(); let newW = Number(scaleWidthEl.value); let newH = Number(scaleHeightEl.value);
  if(mode==='percent'){ // treat width field as percentage
    const pct = Number(scaleWidthEl.value); if(isNaN(pct) || pct<=0){ alert('Неверное значение процента'); return; } const s = pct/100; newW = Math.max(1, Math.round(originalImageData.width * s)); newH = Math.max(1, Math.round(originalImageData.height * s)); }
  // validate ranges
  if(newW < 1 || newH < 1 || newW > 20000 || newH > 20000){ alert('Размеры вне допустимого диапазона (1..20000)'); return; }
  interpolationMethod = scaleAlgoEl.value || 'bilinear';
  // perform scaling from original source
  const scaled = scaleImageData(originalImageData, newW, newH, interpolationMethod);
  originalImageData = scaled; originalIsGB7 = false; // scaled image is RGBA
  // reset levels and previews for new image
  initLevelsDefaults(); updatePreviews().then(()=>{ renderDisplayedImage(); if(scaleDialog) scaleDialog.close(); // set scale to 100%
    currentScale = 1; updateScaleDisplay(); });
});

function initLevelsDefaults(){
  const bins = originalIsGB7 ? 128 : 256;
  const def = ()=>({black:0, white:bins-1, gamma:1});
  levelsMap = { master:def(), r:def(), g:def(), b:def(), a:def() };
  if(levelBlackEl && levelWhiteEl && levelGammaEl){
    levelBlackEl.min = 0; levelBlackEl.max = bins-1; levelWhiteEl.min = 0; levelWhiteEl.max = bins-1;
    levelBlackEl.value = 0; levelWhiteEl.value = bins-1; levelGammaEl.value = 1;
    levelBlackVal.textContent = levelBlackEl.value; levelWhiteVal.textContent = levelWhiteEl.value; levelGammaVal.textContent = Number(levelGammaEl.value).toFixed(2);
  }
}

function computeHistogram(channel){
  if(!originalImageData) return null;
  const bins = originalIsGB7 ? 128 : 256;
  const counts = new Uint32Array(bins);
  const d = originalImageData.data;
  for(let i=0;i<d.length;i+=4){
    let v;
    if(channel==='master') v = Math.round(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]);
    else if(channel==='r') v = d[i];
    else if(channel==='g') v = d[i+1];
    else if(channel==='b') v = d[i+2];
    else v = d[i+3];
    if(bins===128){ const idx = Math.round(v * (bins-1) / 255); counts[idx]++; } else { counts[v]++; }
  }
  return counts;
}

function drawHistogram(channel, useLog){
  if(!histCtx || !originalImageData) return;
  const counts = computeHistogram(channel) || new Uint32Array(256);
  const bins = counts.length;
  const w = histCanvas.width, h = histCanvas.height;
  histCtx.clearRect(0,0,w,h);
  // background
  histCtx.fillStyle = '#fff'; histCtx.fillRect(0,0,w,h);
  // find max (log or linear)
  let max = 0; for(let i=0;i<bins;i++){ const v = counts[i]; if(useLog){ const lv = Math.log10(v+1); if(lv>max) max=lv } else { if(v>max) max=v } }
  if(max===0) max=1;
  const barW = w / bins;
  histCtx.fillStyle = '#6b7280';
  for(let i=0;i<bins;i++){
    const v = counts[i]; const val = useLog ? Math.log10(v+1) : v; const ph = Math.round((val/max) * (h-4));
    const x = Math.round(i*barW);
    histCtx.fillRect(x, h-1-ph, Math.max(1, Math.ceil(barW)), ph);
  }
  // draw markers for black/white/gamma
  const sel = levelsChannelEl ? levelsChannelEl.value : 'master';
  const s = levelsMap && levelsMap[sel] ? levelsMap[sel] : {black:0, white: bins-1, gamma:1};
  const scale = (v)=> (bins===128? (v/(bins-1)) : (v/(bins-1)));
  const bx = Math.round(scale(s.black)*w);
  const wx = Math.round(scale(s.white)*w);
  histCtx.strokeStyle = 'red'; histCtx.lineWidth = 2; histCtx.beginPath(); histCtx.moveTo(bx,0); histCtx.lineTo(bx,h); histCtx.stroke();
  histCtx.strokeStyle = 'green'; histCtx.beginPath(); histCtx.moveTo(wx,0); histCtx.lineTo(wx,h); histCtx.stroke();
}

function updateSlidersFromMap(){
  const bins = originalIsGB7 ? 128 : 256;
  const sel = levelsChannelEl.value;
  const s = levelsMap[sel];
  levelBlackEl.max = bins-1; levelWhiteEl.max = bins-1;
  levelBlackEl.value = s.black; levelWhiteEl.value = s.white; levelGammaEl.value = s.gamma;
  levelBlackVal.textContent = levelBlackEl.value; levelWhiteVal.textContent = levelWhiteEl.value; levelGammaVal.textContent = Number(levelGammaEl.value).toFixed(2);
  drawHistogram(sel, !!levelsLogEl.checked);
}

function makeLutBins(black, white, gamma, bins){
  const lut = new Uint8Array(bins);
  const denom = Math.max(1, white - black);
  for(let i=0;i<bins;i++){
    let t = (i - black) / denom;
    if(t<=0) lut[i]=0;
    else if(t>=1) lut[i]=bins-1;
    else lut[i] = Math.round(Math.pow(t, 1.0 / gamma) * (bins-1));
  }
  return lut;
}

function expandLutTo256(lutBins, bins){
  const out = new Uint8Array(256);
  if(bins===256){ for(let i=0;i<256;i++) out[i]=lutBins[i]; }
  else { for(let v=0;v<256;v++){ const idx = Math.round(v * (bins-1) / 255); const mapped = lutBins[idx]; out[v] = Math.round(mapped * 255 / (bins-1)); } }
  return out;
}

function applyLevelsPreview(){
  if(!originalImageData) return;
  if(!levelsPreviewEl.checked){ renderDisplayedImage(); return; }
  // build LUTs
  const bins = originalIsGB7 ? 128 : 256;
  const master = levelsMap.master; const rset = levelsMap.r; const gset = levelsMap.g; const bset = levelsMap.b; const aset = levelsMap.a;
  const masterLut = (master && !(master.black===0 && master.white===bins-1 && master.gamma===1)) ? expandLutTo256(makeLutBins(master.black, master.white, master.gamma, bins), bins) : null;
  const rLut = (rset && !(rset.black===0 && rset.white===bins-1 && rset.gamma===1)) ? expandLutTo256(makeLutBins(rset.black, rset.white, rset.gamma, bins), bins) : null;
  const gLut = (gset && !(gset.black===0 && gset.white===bins-1 && gset.gamma===1)) ? expandLutTo256(makeLutBins(gset.black, gset.white, gset.gamma, bins), bins) : null;
  const bLut = (bset && !(bset.black===0 && bset.white===bins-1 && bset.gamma===1)) ? expandLutTo256(makeLutBins(bset.black, bset.white, bset.gamma, bins), bins) : null;
  const aLut = (aset && !(aset.black===0 && aset.white===bins-1 && aset.gamma===1)) ? expandLutTo256(makeLutBins(aset.black, aset.white, aset.gamma, bins), bins) : null;

  const w = originalImageData.width, h=originalImageData.height;
  const out = new ImageData(w,h);
  const od = originalImageData.data, nd = out.data;
  for(let i=0;i<od.length;i+=4){
    let r = od[i], g = od[i+1], b = od[i+2], a = od[i+3];
    if(masterLut){ r = masterLut[r]; g = masterLut[g]; b = masterLut[b]; }
    if(rLut) r = rLut[r]; if(gLut) g = gLut[g]; if(bLut) b = bLut[b]; if(aLut) a = aLut[a];
    nd[i]=r; nd[i+1]=g; nd[i+2]=b; nd[i+3]=a;
  }
  displayedImageData = out; drawToCanvas(displayedImageData);
}

function applyLevelsToOriginal(){
  if(!originalImageData) return;
  // similar to preview but write back to originalImageData
  const bins = originalIsGB7 ? 128 : 256;
  const master = levelsMap.master; const rset = levelsMap.r; const gset = levelsMap.g; const bset = levelsMap.b; const aset = levelsMap.a;
  const masterLut = (master && !(master.black===0 && master.white===bins-1 && master.gamma===1)) ? expandLutTo256(makeLutBins(master.black, master.white, master.gamma, bins), bins) : null;
  const rLut = (rset && !(rset.black===0 && rset.white===bins-1 && rset.gamma===1)) ? expandLutTo256(makeLutBins(rset.black, rset.white, rset.gamma, bins), bins) : null;
  const gLut = (gset && !(gset.black===0 && gset.white===bins-1 && gset.gamma===1)) ? expandLutTo256(makeLutBins(gset.black, gset.white, gset.gamma, bins), bins) : null;
  const bLut = (bset && !(bset.black===0 && bset.white===bins-1 && bset.gamma===1)) ? expandLutTo256(makeLutBins(bset.black, bset.white, bset.gamma, bins), bins) : null;
  const aLut = (aset && !(aset.black===0 && aset.white===bins-1 && aset.gamma===1)) ? expandLutTo256(makeLutBins(aset.black, aset.white, aset.gamma, bins), bins) : null;

  const w = originalImageData.width, h=originalImageData.height;
  const out = new ImageData(w,h);
  const od = originalImageData.data, nd = out.data;
  for(let i=0;i<od.length;i+=4){
    let r = od[i], g = od[i+1], b = od[i+2], a = od[i+3];
    if(masterLut){ r = masterLut[r]; g = masterLut[g]; b = masterLut[b]; }
    if(rLut) r = rLut[r]; if(gLut) g = gLut[g]; if(bLut) b = bLut[b]; if(aLut) a = aLut[a];
    nd[i]=r; nd[i+1]=g; nd[i+2]=b; nd[i+3]=a;
  }
  // replace original and update previews
  originalImageData = out; updatePreviews().then(()=>{ renderDisplayedImage(); });
}

// UI wiring
if(btnLevels){ btnLevels.addEventListener('click', ()=>{ if(!originalImageData){ setStatus('Загрузите изображение перед использованием Уровней'); return } openLevelsDialog(); }); }

function openLevelsDialog(){
  if(!levelsMap) initLevelsDefaults();
  const bins = originalIsGB7 ? 128 : 256;
  levelBlackEl.min = 0; levelBlackEl.max = bins-1; levelWhiteEl.min = 0; levelWhiteEl.max = bins-1;
  updateSlidersFromMap();
  drawHistogram(levelsChannelEl.value, !!levelsLogEl.checked);
  levelsDialog.showModal();
}

if(levelsChannelEl){ levelsChannelEl.addEventListener('change', ()=>{ updateSlidersFromMap(); drawHistogram(levelsChannelEl.value, !!levelsLogEl.checked); }); }

function onLevelInput(e){
  const bins = originalIsGB7 ? 128 : 256;
  let black = Number(levelBlackEl.value); let white = Number(levelWhiteEl.value);
  // enforce ordering
  if(black < 0) black = 0; if(white > bins-1) white = bins-1;
  if(black >= white){ if(e.target===levelBlackEl) black = Math.max(0, white-1); else white = Math.min(bins-1, black+1); }
  levelBlackEl.value = black; levelWhiteEl.value = white;
  levelBlackVal.textContent = black; levelWhiteVal.textContent = white;
  levelGammaVal.textContent = Number(levelGammaEl.value).toFixed(2);
  const sel = levelsChannelEl.value; levelsMap[sel].black = black; levelsMap[sel].white = white; levelsMap[sel].gamma = Number(levelGammaEl.value);
  // schedule preview
  if(rafLevels) cancelAnimationFrame(rafLevels);
  rafLevels = requestAnimationFrame(()=>{ applyLevelsPreview(); drawHistogram(sel, !!levelsLogEl.checked); rafLevels = null; });
}

if(levelBlackEl) levelBlackEl.addEventListener('input', onLevelInput);
if(levelWhiteEl) levelWhiteEl.addEventListener('input', onLevelInput);
if(levelGammaEl) levelGammaEl.addEventListener('input', onLevelInput);
if(levelsLogEl) levelsLogEl.addEventListener('change', ()=> drawHistogram(levelsChannelEl.value, !!levelsLogEl.checked));
if(levelsPreviewEl) levelsPreviewEl.addEventListener('change', ()=>{ if(levelsPreviewEl.checked) applyLevelsPreview(); else renderDisplayedImage(); });

if(levelsResetBtn) levelsResetBtn.addEventListener('click', ()=>{ const sel = levelsChannelEl.value; const bins = originalIsGB7 ? 128 : 256; levelsMap[sel] = {black:0, white:bins-1, gamma:1}; updateSlidersFromMap(); applyLevelsPreview(); });
if(levelsCancelBtn) levelsCancelBtn.addEventListener('click', ()=>{ // revert preview and close
  renderDisplayedImage(); if(levelsDialog) levelsDialog.close(); });
if(levelsApplyBtn) levelsApplyBtn.addEventListener('click', ()=>{ applyLevelsToOriginal(); if(levelsDialog) levelsDialog.close(); });
