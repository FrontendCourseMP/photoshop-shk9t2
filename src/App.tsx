import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeGb7, encodeGb7, type PixelImage } from './gb7';
import { decodeBrowserImage, downloadBytes, isBrowserImage, isGb7 } from './image-file';
import { renderChannels, toLab, type Channel } from './color';
import { LevelsDialog } from './LevelsDialog';
import { applyLevels, DEFAULT_LEVELS_STATE, type LevelsState } from './levels';

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

    const d = { width: image.width, height: image.height, data: image.data };
    const t = document.createElement('canvas');
    t.width = image.width;
    t.height = image.height;
    t.getContext('2d')?.putImageData(
      new ImageData(new Uint8ClampedArray(d.data), d.width, d.height),
      0,
      0
    );
    c.getContext('2d')?.drawImage(t, 0, 0, w, h);
  }, [image]);

  return <canvas ref={ref} className="channel-thumb" aria-hidden="true" />;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [channels, setChannels] = useState<Set<Channel>>(new Set());
  const [eyedropper, setEyedropper] = useState(false);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [notice, setNotice] = useState(
    'Загрузите PNG, JPG или GB7 — и начните редактировать изображение.'
  );

  // Levels state
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levelsState, setLevelsState] = useState<LevelsState>(DEFAULT_LEVELS_STATE);
  const [levelsPreview, setLevelsPreview] = useState(true);
  const [originalImage, setOriginalImage] = useState<PixelImage | null>(null);

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

  const display = useMemo(() => {
    if (!loaded) return null;
    
    // Apply channel filtering
    let result = renderChannels(loaded.image, channels, loaded.grayscale);
    
    // Apply levels if needed
    if (levelsOpen || levelsPreview) {
      result = applyLevels(result, levelsState, loaded.grayscale, loaded.hasAlpha);
    }
    
    return result;
  }, [loaded, channels, levelsState, levelsOpen, levelsPreview]);

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
          colorDepth: d.metadata.hasMask ? '7 бит + альфа' : '7 бит',
          grayscale: true,
          hasAlpha: d.metadata.hasMask,
        };
      } else if (isBrowserImage(file)) {
        const image = await decodeBrowserImage(file);
        next = {
          image,
          source: /\.png$/i.test(file.name) ? 'PNG' : 'JPG',
          name: file.name,
          colorDepth: '8 бит × 4 (RGBA)',
          grayscale: false,
          hasAlpha: true,
        };
      } else {
        throw new Error(
          'Поддерживаются только PNG, JPG/JPEG и GB7 — другие форматы не обслуживаются.'
        );
      }

      setLoaded(next);
      setChannels(
        new Set(
          next.grayscale
            ? next.hasAlpha
              ? (['gray', 'alpha'] as const)
              : (['gray'] as const)
            : (['red', 'green', 'blue', 'alpha'] as const)
        )
      );
      setPicked(null);
      setOriginalImage(next.image);
      setLevelsState(DEFAULT_LEVELS_STATE);
      setNotice(`✓ Загружено ${file.name}`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Что-то пошло не так при загрузке файла.'
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
      setNotice('✓ GB7 загружено.');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Не удалось экспортировать GB7.'
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
    if (!eyedropper || !loaded) return;

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
    const d = loaded.image.data;

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
    // Levels already applied via display effect
  }, []);

  const handleLevelsCancel = useCallback(() => {
    setLevelsOpen(false);
    setLevelsState(DEFAULT_LEVELS_STATE);
    setLevelsPreview(true);
  }, []);

  return (
    <main className="application">
      <header className="topbar">
        <div>
          <span className="eyebrow">Лабораторная работа 3</span>
          <h1>GrayBit Studio</h1>
        </div>
        <label className="primary-button">
          Загрузить изображение
          <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.gb7" onChange={onSelect} />
        </label>
      </header>

      <section className="toolbar">
        <span>Инструменты</span>
        <button onClick={() => raster('image/png')} disabled={!loaded}>
          PNG
        </button>
        <button onClick={() => raster('image/jpeg')} disabled={!loaded}>
          JPG
        </button>
        <button onClick={exportGb7} disabled={!loaded}>
          GB7
        </button>
        <span className="toolbar-divider" />
        <button
          className={eyedropper ? 'tool-active' : ''}
          onClick={() => setEyedropper(!eyedropper)}
          disabled={!loaded}
        >
          🎯 Пипетка
        </button>
        <button
          onClick={() => setLevelsOpen(true)}
          disabled={!loaded}
        >
          ⚙️ Уровни
        </button>
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
                <i>{channels.has(ch) ? '✓' : '✕'}</i>
              </button>
            ))
          ) : (
            <p>Загрузите изображение, чтобы увидеть каналы.</p>
          )}
        </aside>

        <section className="workspace">
          {loaded ? (
            <canvas
              ref={canvasRef}
              className={eyedropper ? 'eyedropper-cursor' : ''}
              onClick={pick}
              aria-label="Изображение"
            />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🖼️</div>
              <h2>Холст пуст</h2>
              <p>Загрузите PNG, JPG или GB7.</p>
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
              {eyedropper ? 'Кликните по изображению...' : 'Выберите пипетку и кликните на пиксель.'}
            </p>
          )}
        </aside>
      </div>

      <p className="notice" role="status">
        {notice}
      </p>

      <footer className="statusbar">
        {loaded ? (
          <>
            <span>
              <b>{loaded.source}</b> • {loaded.name}
            </span>
            <span>
              {loaded.image.width} × {loaded.image.height} px
            </span>
            <span>{loaded.colorDepth}</span>
          </>
        ) : (
          <span>Ничего не загружено</span>
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
    </main>
  );
}
