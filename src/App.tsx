import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeGb7, encodeGb7, type PixelImage } from './gb7';
import { decodeBrowserImage, downloadBytes, isBrowserImage, isGb7 } from './image-file';
import { renderChannels, toLab, type Channel } from './color';
import { LevelsDialog } from './LevelsDialog';
import { applyLevels, DEFAULT_LEVELS_STATE, type LevelsState } from './levels';
import { ResizeDialog } from './ResizeDialog';
import { KernelDialog } from './KernelDialog';
import { clampZoom, fitZoom, ZOOM_MAX, ZOOM_MIN } from './scale';

type LoadedImage = { 
  image: PixelImage; 
  source: 'PNG' | 'JPG' | 'GB7'; 
  name: string; 
  colorDepth: string; 
  grayscale: boolean; 
  hasAlpha: boolean 
};

type Pick = { 
  x: number; 
  y: number; 
  r: number; 
  g: number; 
  b: number; 
  a: number; 
  lab: ReturnType<typeof toLab> 
};

const names: Record<Channel, string> = {
  gray: 'Яркость',
  red: 'Красный',
  green: 'Зелёный',
  blue: 'Синий',
  alpha: 'Альфа',
};

const cleanName = (name: string) => name.replace(/\.[^.]+$/, '') || 'image';

const ZOOM_PRESETS: { label: string; value: number }[] = [
  { label: '12%', value: 12 },
  { label: '25%', value: 25 },
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: '100%', value: 100 },
  { label: '150%', value: 150 },
  { label: '200%', value: 200 },
  { label: '300%', value: 300 },
];

function Thumbnail({
  image,
  channel,
  grayscale,
}: {
  image: PixelImage;
  channel: Channel;
  grayscale: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;

    const w = 72;
    const h = Math.max(24, Math.round((w * image.height) / image.width));
    c.width = w;
    c.height = h;

    // Для превью одиночного канала используем градации серого:
    // — общепринятый подход в графических редакторах;
    // — alpha-канал традиционно показывается как ч/б маска в любом случае.
    const data = new Uint8ClampedArray(image.data.length);
    for (let i = 0; i < image.data.length; i += 4) {
      let value: number;
      if (channel === 'alpha') value = image.data[i + 3];
      else if (grayscale || channel === 'gray') value = image.data[i];
      else if (channel === 'red') value = image.data[i];
      else if (channel === 'green') value = image.data[i + 1];
      else value = image.data[i + 2];
      // Все три компоненты одинаковые → градации серого, alpha强制 255.
      data.set([value, value, value, 255], i);
    }

    const t = document.createElement('canvas');
    t.width = image.width;
    t.height = image.height;
    t.getContext('2d')?.putImageData(
      new ImageData(new Uint8ClampedArray(data), image.width, image.height),
      0,
      0
    );
    c.getContext('2d')?.drawImage(t, 0, 0, w, h);
  }, [image, channel, grayscale]);

  return <canvas ref={ref} className="channel-thumb" aria-hidden="true" />;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [channels, setChannels] = useState<Set<Channel>>(new Set());
  const [eyedropper, setEyedropper] = useState(false);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [notice, setNotice] = useState(
    'Откройте PNG, JPG или GB7 — изображение появится на холсте.'
  );

  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levelsState, setLevelsState] = useState<LevelsState>(DEFAULT_LEVELS_STATE);
  const [levelsPreview, setLevelsPreview] = useState(true);

  const [resizeOpen, setResizeOpen] = useState(false);
  const [kernelOpen, setKernelOpen] = useState(false);
  const [kernelPreview, setKernelPreview] = useState<PixelImage | null>(null);
  const [zoom, setZoom] = useState<number>(100);

  const available = useMemo(() => {
    if (!loaded) return [];
    return loaded.grayscale
      ? loaded.hasAlpha
        ? (['gray', 'alpha'] as const)
        : (['gray'] as const)
      : loaded.hasAlpha
        ? (['red', 'green', 'blue', 'alpha'] as const)
        : (['red', 'green', 'blue'] as const);
  }, [loaded]);

  // Защищаемся от несовпадения: если в channels остались каналы от предыдущего
  // формата (например, RGB → grayscale), удаляем недопустимые.
  useEffect(() => {
    if (!loaded) return;
    setChannels((old) => {
      const next = new Set<Channel>();
      old.forEach((ch) => {
        if ((available as readonly Channel[]).includes(ch)) next.add(ch);
      });
      // Если после очистки ни один канал не остался — включаем все доступные.
      if (next.size === 0) available.forEach((ch) => next.add(ch));
      return next;
    });
  }, [loaded, available]);

  const display = useMemo(() => {
    if (!loaded) return null;

    const base = kernelPreview ?? loaded.image;
    let result = renderChannels(base, channels, loaded.grayscale);

    if (levelsOpen || levelsPreview) {
      result = applyLevels(result, levelsState, loaded.grayscale, loaded.hasAlpha);
    }

    return result;
  }, [loaded, channels, levelsState, levelsOpen, levelsPreview, kernelPreview]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !display) return;

    c.width = display.width;
    c.height = display.height;
    c
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(display.data), display.width, display.height),
        0,
        0
      );
  }, [display]);

  useEffect(() => {
    if (!loaded || !workspaceRef.current) return;
    const workspace = workspaceRef.current;
    const measure = () => {
      const rect = workspace.getBoundingClientRect();
      const next = fitZoom(loaded.image.width, loaded.image.height, rect.width, rect.height, 50);
      setZoom(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(workspace);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [loaded?.image.width, loaded?.image.height]);

  async function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      let next: LoadedImage;

      if (isGb7(file)) {
        const d = decodeGb7(await file.arrayBuffer());
        next = {
          image: d,
          source: 'GB7',
          name: file.name,
          colorDepth: d.metadata.hasMask ? '7 бит + маска' : '7 бит, серый',
          grayscale: true,
          hasAlpha: d.metadata.hasMask,
        };
      } else if (isBrowserImage(file)) {
        const image = await decodeBrowserImage(file);
        const isJpeg = /\.jpe?g$/i.test(file.name);

        let hasAlpha = false;
        let isGrayscale = true;
        for (let i = 0; i < image.data.length; i += 4) {
          const r = image.data[i];
          const g = image.data[i + 1];
          const b = image.data[i + 2];
          const a = image.data[i + 3];
          if (r !== g || g !== b) isGrayscale = false;
          if (a < 255) hasAlpha = true;
          if (!isGrayscale && hasAlpha) break; // обе проверки удовлетворены — дальше не сканируем
        }
        // JPEG по определению не может иметь альфа
        if (isJpeg) hasAlpha = false;

        // Формируем строку глубины цвета в зависимости от реального формата
        let colorDepth: string;
        if (isGrayscale) {
          colorDepth = hasAlpha ? '8 бит × 2 (серый + альфа)' : '8 бит × 1 (серый)';
        } else {
          colorDepth = hasAlpha ? '8 бит × 4 (RGBA)' : '8 бит × 3 (RGB)';
        }

        next = {
          image,
          source: isJpeg ? 'JPG' : 'PNG',
          name: file.name,
          colorDepth,
          grayscale: isGrayscale,
          hasAlpha,
        };
      } else {
        throw new Error(
          'Поддерживаются только PNG, JPG/JPEG и GB7.'
        );
      }

      setLoaded(next);
      // Количество каналов строго соответствует формату:
      // 1 (grayscale) / 2 (grayscale + alpha) / 3 (RGB) / 4 (RGBA)
      setChannels(
        new Set(
          next.grayscale
            ? next.hasAlpha
              ? (['gray', 'alpha'] as const)
              : (['gray'] as const)
            : next.hasAlpha
              ? (['red', 'green', 'blue', 'alpha'] as const)
              : (['red', 'green', 'blue'] as const)
        )
      );
      setPicked(null);
      setLevelsState(DEFAULT_LEVELS_STATE);
      setLevelsOpen(false);
      setResizeOpen(false);
      setKernelOpen(false);
      setKernelPreview(null);
      setNotice(`Загружен файл «${file.name}».`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось открыть изображение.'
      );
    }
  }

  function toggle(ch: Channel) {
    setChannels((old) => {
      const n = new Set(old);
      n.has(ch) ? n.delete(ch) : n.add(ch);
      return n;
    });
  }

  function imageData() {
    if (!canvasRef.current || !loaded) throw new Error('Сначала загрузите изображение.');
    return canvasRef.current.getContext('2d', { willReadFrequently: true })!.getImageData(
      0,
      0,
      loaded.image.width,
      loaded.image.height
    );
  }

  function exportGb7() {
    try {
      downloadBytes(
        (encodeGb7(imageData()) as unknown as BlobPart),
        `${cleanName(loaded!.name)}.gb7`,
        'application/octet-stream'
      );
      setNotice('GB7 скачан.');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Ошибка скачивания.'
      );
    }
  }

  function raster(type: 'image/png' | 'image/jpeg') {
    const c = canvasRef.current;
    if (!c || !loaded) return;

    c.toBlob(
      (b) => {
        if (b)
          downloadBytes(
            b,
            `${cleanName(loaded.name)}.${type === 'image/png' ? 'png' : 'jpg'}`,
            type
          );
      },
      type,
      0.92
    );
  }

  function pick(e: MouseEvent<HTMLCanvasElement>) {
    if (!eyedropper || !loaded || !display) return;

    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(
      loaded.image.width - 1,
      Math.max(0, Math.floor(((e.clientX - r.left) * loaded.image.width) / r.width))
    );
    const y = Math.min(
      loaded.image.height - 1,
      Math.max(0, Math.floor(((e.clientY - r.top) * loaded.image.height) / r.height))
    );

    const i = (y * loaded.image.width + x) * 4;
    const d = display.data;

    setPicked({
      x,
      y,
      r: d[i],
      g: d[i + 1],
      b: d[i + 2],
      a: d[i + 3],
      lab: toLab(d[i], d[i + 1], d[i + 2]),
    });
  }

  const handleLevelsApply = useCallback(() => {
    setLevelsOpen(false);
    if (!loaded) return;
    try {
      const applied = applyLevels(loaded.image, levelsState, loaded.grayscale, loaded.hasAlpha);
      setLoaded({ ...loaded, image: applied });
      setLevelsState(DEFAULT_LEVELS_STATE);
      setNotice('Коррекция уровней применена.');
    } catch {
      /* noop */
    }
  }, [loaded, levelsState]);

  const handleLevelsCancel = useCallback(() => {
    setLevelsOpen(false);
    setLevelsState(DEFAULT_LEVELS_STATE);
    setLevelsPreview(true);
  }, []);

  function openResize() { if (!loaded) return; setResizeOpen(true); }
  function closeResize() { setResizeOpen(false); }
  function applyResizeResult(nextImage: PixelImage) {
    if (!loaded) return;
    setLoaded({ ...loaded, image: nextImage });
    setNotice(`Размер изменён: ${nextImage.width} × ${nextImage.height}.`);
  }

  function openKernel() { if (!loaded) return; setKernelOpen(true); }
  function closeKernel() { setKernelOpen(false); setKernelPreview(null); }
  function applyKernelResult(nextImage: PixelImage) {
    if (!loaded) return;
    setLoaded({ ...loaded, image: nextImage });
    setKernelPreview(null);
    setNotice('Фильтрация ядром применена.');
  }

  const cssSize = useMemo(() => {
    if (!loaded) return null;
    const z = zoom / 100;
    return {
      cssWidth: Math.max(1, Math.round(loaded.image.width * z)),
      cssHeight: Math.max(1, Math.round(loaded.image.height * z)),
    };
  }, [loaded, zoom]);

  return (
    <main className="application">
      <header className="topbar">
        <div>
          <span className="eyebrow">Лабораторная работа 3</span>
          <h1>GrayBit Studio</h1>
        </div>
        <label className="primary-button">
          Открыть изображение
          <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg,.gb7" onChange={onSelect} />
        </label>
      </header>

      <section className="toolbar">
        <span>Скачать как</span>
        <button onClick={() => raster('image/png')} disabled={!loaded}>PNG</button>
        <button onClick={() => raster('image/jpeg')} disabled={!loaded}>JPG</button>
        <button onClick={exportGb7} disabled={!loaded}>GB7</button>
        <span className="toolbar-divider" />
        <button
          className={eyedropper ? 'tool-active' : ''}
          onClick={() => setEyedropper(!eyedropper)}
          disabled={!loaded}
        >
          ⌖ Пипетка
        </button>
        <button onClick={() => setLevelsOpen(true)} disabled={!loaded}>⇌ Уровни</button>
        <button onClick={openResize} disabled={!loaded}>⤢ Изменить размер</button>
        <button onClick={openKernel} disabled={!loaded}>⊞ Фильтрация</button>
      </section>

      <div className="editor">
        <aside className="channels">
          <h2>Каналы</h2>
          {loaded ? (
            available.map((ch) => (
              <button
                className={`channel ${channels.has(ch) ? 'selected' : ''}`}
                onClick={() => toggle(ch)}
                key={ch}
                aria-pressed={channels.has(ch)}
              >
                <Thumbnail image={loaded.image} channel={ch} grayscale={loaded.grayscale} />
                <span>{names[ch]}</span>
                <i>{channels.has(ch) ? '✓' : '—'}</i>
              </button>
            ))
          ) : (
            <p>Загрузите изображение.</p>
          )}
        </aside>

        <section className="workspace" ref={workspaceRef}>
          {loaded ? (
            <canvas
              ref={canvasRef}
              className={eyedropper ? 'eyedropper-cursor' : ''}
              onClick={pick}
              aria-label="Изображение"
              style={
                cssSize
                  ? {
                      width: cssSize.cssWidth,
                      height: cssSize.cssHeight,
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }
                  : undefined
              }
            />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">◫</div>
              <h2>Холст ждёт изображение</h2>
              <p>Откройте PNG, JPG или GB7.</p>
            </div>
          )}
        </section>

        <aside className="inspector">
          <h2>Пипетка</h2>
          {picked ? (
            <>
              <div className="swatch" style={{ background: `rgb(${picked.r} ${picked.g} ${picked.b})` }} />
              <p>
                <b>
                  X {picked.x}, Y {picked.y}
                </b>
              </p>
              <p>
                RGB: {picked.r}, {picked.g}, {picked.b}
                <br />
                Alpha: {picked.a}
              </p>
              <p>
                CIELAB
                <br />
                L* {picked.lab.l.toFixed(2)}
                <br />
                a* {picked.lab.a.toFixed(2)}
                <br />
                b* {picked.lab.b.toFixed(2)}
              </p>
            </>
          ) : (
            <p>
              {eyedropper ? 'Кликните по изображению.' : 'Включите пипетку и выберите пиксель.'}
            </p>
          )}
        </aside>
      </div>

      <p className="notice" role="status">{notice}</p>

      <footer className="statusbar">
        {loaded ? (
          <>
            <span>
              <b>{loaded.source}</b> · {loaded.name}
            </span>
            <span>
              {loaded.image.width} × {loaded.image.height} px
            </span>
            <span>{loaded.colorDepth}</span>
            <span className="zoom-controls">
              <label className="zoom-preset-label">
                <span>Масштаб</span>
                <select
                  className="zoom-preset"
                  value={String(zoom)}
                  onChange={(e) => setZoom(clampZoom(Number(e.target.value)))}
                  disabled={!loaded}
                  aria-label="Масштаб (пресет)"
                >
                  {ZOOM_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                  {!ZOOM_PRESETS.some((p) => p.value === zoom) ? (
                    <option value={zoom}>{zoom}%</option>
                  ) : null}
                </select>
              </label>
              <input
                className="zoom-range"
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={1}
                value={zoom}
                disabled={!loaded}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Масштаб"
              />
              <span className="zoom-value">{zoom}%</span>
            </span>
          </>
        ) : (
          <span>Нет открытого изображения</span>
        )}
      </footer>

      <LevelsDialog
        open={levelsOpen}
        image={loaded?.image || { width: 0, height: 0, data: new Uint8ClampedArray() }}
        grayscale={loaded?.grayscale || false}
        hasAlpha={loaded?.hasAlpha || false}
        state={levelsState}
        onStateChange={setLevelsState}
        onApply={handleLevelsApply}
        onCancel={handleLevelsCancel}
        onPreviewChange={setLevelsPreview}
        preview={levelsPreview}
      />

      {resizeOpen && loaded && (
        <ResizeDialog
          image={loaded.image}
          onApply={applyResizeResult}
          onClose={closeResize}
        />
      )}

      {kernelOpen && loaded && (
        <KernelDialog
          image={loaded.image}
          grayscale={loaded.grayscale}
          hasAlpha={loaded.hasAlpha}
          onApply={applyKernelResult}
          onClose={closeKernel}
          onPreview={setKernelPreview}
        />
      )}
    </main>
  );
}
