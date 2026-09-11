import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { decodeGb7, encodeGb7, type PixelImage } from './gb7';
import { decodeBrowserImage, downloadBytes, isBrowserImage, isGb7 } from './image-file';

type LoadedImage = { image: PixelImage; source: 'PNG' | 'JPG' | 'GB7'; name: string; colorDepth: string };

function cleanName(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'image';
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [notice, setNotice] = useState('Откройте PNG, JPG или GB7 — изображение появится на холсте.');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    canvas.width = loaded.image.width;
    canvas.height = loaded.image.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    // A fresh typed array also guarantees an ArrayBuffer-backed ImageData for all browsers.
    context.putImageData(new ImageData(new Uint8ClampedArray(loaded.image.data), loaded.image.width, loaded.image.height), 0, 0);
  }, [loaded]);

  async function onSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (isGb7(file)) {
        const result = decodeGb7(await file.arrayBuffer());
        setLoaded({ image: result, source: 'GB7', name: file.name, colorDepth: result.metadata.hasMask ? '7 бит + маска' : '7 бит, серый' });
      } else if (isBrowserImage(file)) {
        const image = await decodeBrowserImage(file);
        const source = /\.png$/i.test(file.name) ? 'PNG' : 'JPG';
        setLoaded({ image, source, name: file.name, colorDepth: '8 бит × 4 (RGBA)' });
      } else {
        throw new Error('Поддерживаются только файлы PNG, JPG/JPEG и GB7.');
      }
      setNotice(`Загружен файл «${file.name}».`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось открыть изображение.');
    }
  }

  function getCanvasImage() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context || !loaded) throw new Error('Сначала загрузите изображение.');
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  function exportGb7() {
    try {
      downloadBytes(encodeGb7(getCanvasImage()) as unknown as BlobPart, `${cleanName(loaded!.name)}.gb7`, 'application/octet-stream');
      setNotice('GB7 скачан. Цветное изображение сохранено в оттенках серого.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось скачать GB7.'); }
  }

  function exportRaster(type: 'image/png' | 'image/jpeg') {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    canvas.toBlob((blob) => {
      if (!blob) return setNotice('Браузер не смог подготовить файл.');
      const extension = type === 'image/png' ? 'png' : 'jpg';
      downloadBytes(blob, `${cleanName(loaded.name)}.${extension}`, type);
      setNotice(`${extension.toUpperCase()} скачан.`);
    }, type, type === 'image/jpeg' ? 0.92 : undefined);
  }

  return <main className="application">
    <header className="topbar">
      <div><span className="eyebrow">Лабораторная работа 1</span><h1>GrayBit Studio</h1></div>
      <label className="primary-button">Открыть изображение<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg,.gb7" onChange={onSelect} /></label>
    </header>
    <section className="toolbar" aria-label="Сохранение изображения">
      <span>Скачать как</span>
      <button onClick={() => exportRaster('image/png')} disabled={!loaded}>PNG</button>
      <button onClick={() => exportRaster('image/jpeg')} disabled={!loaded}>JPG</button>
      <button onClick={exportGb7} disabled={!loaded}>GB7</button>
    </section>
    <section className="workspace" aria-live="polite">
      {loaded ? <canvas ref={canvasRef} aria-label={`Загруженное изображение ${loaded.name}`} /> : <div className="empty-state"><div className="empty-icon">◫</div><h2>Холст ждёт изображение</h2><p>Перетащите файл сюда или нажмите «Открыть изображение».</p></div>}
    </section>
    <p className="notice" role="status">{notice}</p>
    <footer className="statusbar">
      {loaded ? <><span><b>{loaded.source}</b> · {loaded.name}</span><span>{loaded.image.width} × {loaded.image.height} px</span><span>{loaded.colorDepth}</span></> : <span>Нет открытого изображения</span>}
    </footer>
  </main>;
}
