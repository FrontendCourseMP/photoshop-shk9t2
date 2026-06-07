(function(){
  // Filters tool: 3x3 kernel, presets, per-channel, edge handling, preview/apply
  const btnFilters = document.getElementById('btnFilters');
  const filtersDialog = document.getElementById('filtersDialog');
  const filterPreset = document.getElementById('filterPreset');
  const filtersPreview = document.getElementById('filtersPreview');
  const kernelInputs = Array.from(document.querySelectorAll('.kernel-input'));
  const filterR = document.getElementById('filterR');
  const filterG = document.getElementById('filterG');
  const filterB = document.getElementById('filterB');
  const filterA = document.getElementById('filterA');
  const filterSelectAll = document.getElementById('filterSelectAll');
  const filtersResetBtn = document.getElementById('filtersReset');
  const filtersCancelBtn = document.getElementById('filtersCancel');
  const filtersApplyBtn = document.getElementById('filtersApply');

  if(!kernelInputs.length) return; // nothing to do if UI not present

  let filtersWorker = null;
  let filterRequestCounter = 0;
  let lastHandledFilterRequest = 0;
  let filterPreviewTimeout = null;

  // initialize worker if available
  if(window.Worker){
    try{ filtersWorker = new Worker('js/filtersWorker.js');
      filtersWorker.onmessage = function(e){
        const data = e.data; if(!data) return;
        const {width,height,buffer,requestId,action} = data;
        if(requestId < lastHandledFilterRequest) return; lastHandledFilterRequest = requestId;
        const arr = new Uint8ClampedArray(buffer);
        const outImg = new ImageData(arr, width, height);
        if(action === 'preview'){
          window.displayedImageData = outImg; window.drawToCanvas(window.displayedImageData);
        } else if(action === 'apply'){
          window.originalImageData = outImg; window.originalIsGB7 = false; if(window.initLevelsDefaults) window.initLevelsDefaults(); if(window.updatePreviews) window.updatePreviews().then(()=>{ if(window.renderDisplayedImage) window.renderDisplayedImage(); });
        }
        if(window.setStatus) window.setStatus('Фильтр применён');
      };
    }catch(e){ console.warn('Filters worker failed to start', e); filtersWorker = null; }
  }

  const filterPresets = {
    identity: [0,0,0,0,1,0,0,0,0],
    sharpen: [0,-1,0,-1,5,-1,0,-1,0],
    gaussian: [1,2,1,2,4,2,1,2,1],
    box: [1,1,1,1,1,1,1,1,1],
    prewitt_x: [-1,0,1,-1,0,1,-1,0,1],
    prewitt_y: [-1,-1,-1,0,0,0,1,1,1]
  };

  function fillKernel(arr){ kernelInputs.forEach((inp,i)=> inp.value = (arr[i]||0)); }
  function readKernel(){ return kernelInputs.map(i=> Number(i.value) || 0); }
  function getEdgeMode(){ const v = document.querySelector('input[name="edgeMode"]:checked'); return v? v.value : 'copy'; }
  function getChannels(){ return { r: !!filterR.checked, g: !!filterG.checked, b: !!filterB.checked, a: !!filterA.checked }; }

  if(filterPreset){ filterPreset.addEventListener('change', ()=>{ const v = filterPreset.value; if(filterPresets[v]) fillKernel(filterPresets[v]); if(filtersPreview && filtersPreview.checked) scheduleFilterPreview(); }); }

  if(filterSelectAll) filterSelectAll.addEventListener('click', ()=>{ filterR.checked = filterG.checked = filterB.checked = filterA.checked = true; if(filtersPreview && filtersPreview.checked) scheduleFilterPreview(); });

  if(kernelInputs) kernelInputs.forEach(inp=> inp.addEventListener('input', ()=>{ if(filtersPreview && filtersPreview.checked) scheduleFilterPreview(); }));
  if([filterR,filterG,filterB,filterA]) [filterR,filterG,filterB,filterA].forEach(cb=>{ if(!cb) return; cb.addEventListener('change', ()=>{ if(filtersPreview && filtersPreview.checked) scheduleFilterPreview(); }); });
  if(filtersDialog && filtersCancelBtn) filtersCancelBtn.addEventListener('click', ()=>{ if(window.renderDisplayedImage) window.renderDisplayedImage(); if(filtersDialog) filtersDialog.close(); });
  if(filtersResetBtn) filtersResetBtn.addEventListener('click', ()=>{ fillKernel(filterPresets.identity); filterA.checked = false; if(filtersPreview && filtersPreview.checked) scheduleFilterPreview(); });

  function scheduleFilterPreview(){ if(filterPreviewTimeout) clearTimeout(filterPreviewTimeout); filterPreviewTimeout = setTimeout(()=>{ applyFilter('preview'); filterPreviewTimeout = null; }, 150); }

  function applyFilter(action){ if(!window.originalImageData) { if(window.setStatus) window.setStatus('Загрузите изображение перед применением фильтра'); return; }
    const kernel = readKernel(); const channels = getChannels(); const edgeMode = getEdgeMode(); const w = window.originalImageData.width, h = window.originalImageData.height;
    const reqId = ++filterRequestCounter;
    if(window.setStatus) window.setStatus((action==='preview'? 'Предпросмотр фильтра...' : 'Применение фильтра...'));
    const srcBuf = window.originalImageData.data.slice().buffer;
    if(filtersWorker){ try{ filtersWorker.postMessage({ cmd:'process', width:w, height:h, buffer: srcBuf, kernel: kernel, channels: channels, edgeMode: edgeMode, requestId: reqId, action: action }, [srcBuf]); }catch(e){ console.warn('Worker postMessage failed', e); // fallback
        setTimeout(()=>{ const out = convolveMainThread(window.originalImageData, kernel, channels, edgeMode); if(action==='preview'){ window.displayedImageData = out; window.drawToCanvas(window.displayedImageData); } else { window.originalImageData = out; window.originalIsGB7 = false; if(window.initLevelsDefaults) window.initLevelsDefaults(); if(window.updatePreviews) window.updatePreviews().then(()=>{ if(window.renderDisplayedImage) window.renderDisplayedImage(); }); } if(window.setStatus) window.setStatus('Готово'); }, 10);
    } } else { // no worker fallback
      setTimeout(()=>{ const out = convolveMainThread(window.originalImageData, kernel, channels, edgeMode); if(action==='preview'){ window.displayedImageData = out; window.drawToCanvas(window.displayedImageData); } else { window.originalImageData = out; window.originalIsGB7 = false; if(window.initLevelsDefaults) window.initLevelsDefaults(); if(window.updatePreviews) window.updatePreviews().then(()=>{ if(window.renderDisplayedImage) window.renderDisplayedImage(); }); } if(window.setStatus) window.setStatus('Готово'); }, 10);
    }
  }

  function convolveMainThread(srcImageData, kernel, channels, edgeMode){ const w = srcImageData.width, h = srcImageData.height; const src = srcImageData.data; const out = new ImageData(w,h); const dst = out.data; dst.set(src);
    let sum=0; for(let i=0;i<9;i++) sum+=kernel[i]; const divisor = (Math.abs(sum) > 1e-8) ? sum : 1;
    function sample(px,py,ci){ if(px<0 || py<0 || px>=w || py>=h){ if(edgeMode==='copy'){ const cx = Math.min(w-1, Math.max(0, px)); const cy = Math.min(h-1, Math.max(0, py)); return src[(cy*w + cx)*4 + ci]; } else if(edgeMode==='black'){ return 0; } else if(edgeMode==='white'){ return 255; } }
      return src[(py*w + px)*4 + ci]; }
    for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const base = (y*w + x)*4; for(let c=0;c<4;c++){ const apply = (c===0 && channels.r) || (c===1 && channels.g) || (c===2 && channels.b) || (c===3 && channels.a); if(!apply){ dst[base+c] = src[base+c]; continue; } let acc=0; let k=0; for(let ky=-1;ky<=1;ky++){ for(let kx=-1;kx<=1;kx++){ const v = sample(x+kx,y+ky,c); acc += v * kernel[k++]; } } let val = Math.round(acc / divisor); if(val<0) val=0; if(val>255) val=255; dst[base+c]=val; } } }
    return out; }

  if(btnFilters){ btnFilters.addEventListener('click', ()=>{ if(!window.originalImageData){ if(window.setStatus) window.setStatus('Загрузите изображение перед использованием фильтров'); return; } // initialize dialog fields
      fillKernel(filterPresets.identity); filterA.checked = false; if(filtersDialog && filtersDialog.showModal) filtersDialog.showModal(); }); }

  if(filtersApplyBtn) filtersApplyBtn.addEventListener('click', ()=>{ if(filtersDialog) filtersDialog.close(); applyFilter('apply'); });

})();
