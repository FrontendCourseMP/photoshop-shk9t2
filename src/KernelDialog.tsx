import { useEffect, useMemo, useRef, useState } from 'react';
import type { PixelImage } from './gb7';
import { Modal } from './Modal';
import {
  applyKernel,
  CHANNEL_LABELS,
  CHANNEL_OFFSETS,
  DEFAULT_KERNEL,
  KERNEL_PRESETS,
  PADDING_MODES,
  normalizeKernel,
  type Kernel3x3,
  type KernelChannel,
  type KernelPreset,
  type PaddingMode,
} from './convolution';

export type KernelDialogProps = {
  image: PixelImage;
  onClose: () => void;
  onApply: (image: PixelImage) => void;
  onPreview?: (image: PixelImage | null) => void;
};

const NUMERIC_REGEXP = /^-?\d*(\.\d+)?$/;

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(4)).toString();
}

export function KernelDialog({ image, onClose, onApply, onPreview }: KernelDialogProps) {
  const [preset, setPreset] = useState<KernelPreset | ''>('identity');
  const [kernelStr, setKernelStr] = useState<string[]>(DEFAULT_KERNEL.map((n) => formatNumber(n)));
  const [padding, setPadding] = useState<PaddingMode>('replicate');
  const [channels, setChannels] = useState<Set<KernelChannel>>(
    new Set<KernelChannel>(['red', 'green', 'blue'])
  );
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [errors, setErrors] = useState<{ kernel?: string; channels?: string }>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const kernelNumbers = useMemo<number[]>(
    () => kernelStr.map((s) => (s === '' || s === '-' ? 0 : Number(s))),
    [kernelStr]
  );

  const normalizeCheck = useMemo(() => {
    try {
      const allValid = kernelStr.every((s) => s !== '' && NUMERIC_REGEXP.test(s));
      if (!allValid) return { ok: false as const, error: 'Все 9 полей должны содержать числа.' };
      const res = normalizeKernel(kernelNumbers);
      return { ok: true as const, ...res };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Некорректное ядро.' };
    }
  }, [kernelStr, kernelNumbers]);

  useEffect(() => {
    const nextErrors: { kernel?: string; channels?: string } = {};
    if (!normalizeCheck.ok) nextErrors.kernel = normalizeCheck.error;
    if (channels.size === 0) nextErrors.channels = 'Выберите хотя бы один канал.';
    setErrors(nextErrors);
  }, [normalizeCheck, channels]);

  const sumInfo = useMemo(() => {
    if (!normalizeCheck.ok) return null;
    const { sum, absSum } = normalizeCheck;
    return { sum, absSum };
  }, [normalizeCheck]);

  useEffect(() => {
    if (!previewEnabled) {
      onPreview?.(null);
      setProgress(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    if (!normalizeCheck.ok || channels.size === 0) {
      onPreview?.(null);
      setProgress(null);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    let cancelled = false;
    (async () => {
      try {
        const result = await applyKernel(image, kernelNumbers, {
          channels,
          padding,
          signal: controller.signal,
          onProgress: (done, total) => {
            if (cancelled) return;
            setProgress({ done, total });
          },
        });
        if (cancelled) return;
        onPreview?.(result);
        setProgress(null);
      } catch (e) {
        if (cancelled) return;
        const isAbort =
          (e instanceof DOMException && e.name === 'AbortError') ||
          (e as { name?: string })?.name === 'AbortError';
        if (!isAbort) {
          onPreview?.(null);
          setProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [previewEnabled, normalizeCheck, kernelNumbers, channels, padding, image, onPreview]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      onPreview?.(null);
    };
  }, [onPreview]);

  const applyPreset = (value: KernelPreset | '') => {
    setPreset(value);
    if (value === '') return;
    const presetObj = KERNEL_PRESETS.find((p) => p.value === value);
    if (!presetObj) return;
    setKernelStr(presetObj.kernel.map((n) => formatNumber(n)));
  };

  const updateCell = (i: number, raw: string) => {
    setPreset('');
    setKernelStr((prev) => {
      const next = [...prev];
      next[i] = raw;
      return next;
    });
  };

  const toggleChannel = (ch: KernelChannel) => {
    setChannels((old) => {
      const n = new Set(old);
      n.has(ch) ? n.delete(ch) : n.add(ch);
      return n;
    });
  };

  const reset = () => {
    applyPreset('identity');
    setPadding('replicate');
    setChannels(new Set<KernelChannel>(['red', 'green', 'blue']));
    setPreviewEnabled(true);
  };

  const close = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    onPreview?.(null);
    onClose();
  };

  const hasErrors = Object.keys(errors).length > 0;
  const [applying, setApplying] = useState(false);

  const doApply = async () => {
    if (hasErrors || applying) return;
    setApplying(true);
    try {
      const result = await applyKernel(image, kernelNumbers, {
        channels,
        padding,
        signal: undefined,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      onPreview?.(null);
      onApply(result);
      onClose();
    } catch (e) {
      const isAbort = (e as { name?: string })?.name === 'AbortError';
      if (!isAbort) {
        setErrors((prev) => ({ ...prev, kernel: e instanceof Error ? e.message : 'Ошибка фильтрации.' }));
      }
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  const footer = (
    <>
      <button type="button" className="levels-btn secondary" onClick={reset} disabled={applying}>Сброс</button>
      <div className="levels-spacer" />
      <button type="button" className="levels-btn secondary" onClick={close} disabled={applying}>Отмена</button>
      <button
        type="button"
        className="levels-btn primary"
        disabled={hasErrors || applying}
        onClick={doApply}
      >
        Применить
      </button>
    </>
  );

  return (
    <Modal
      title="Фильтрация / Ядро 3×3"
      onClose={close}
      widthMax="680px"
      footer={footer}
      className="kernel-dialog"
    >
      <div className="kernel-layout">
        <div className="kernel-column">
          <label className="num-input kernel-preset">
            <span>Пресет</span>
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value as KernelPreset | '')}
              disabled={applying}
            >
              {KERNEL_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="">(своё ядро)</option>
            </select>
          </label>

          <div className="kernel-sum">
            {sumInfo ? (
              <>
                <div>
                  <span className="kernel-sum-label">Σ</span>
                  <span className="kernel-sum-value">{sumInfo.sum.toFixed(3)}</span>
                </div>
                <div>
                  <span className="kernel-sum-label">|Σ|</span>
                  <span className="kernel-sum-value">{sumInfo.absSum.toFixed(3)}</span>
                </div>
                <div className="kernel-sum-note">
                  {sumInfo.sum !== 0
                    ? 'нормализация по сумме'
                    : sumInfo.absSum !== 0
                      ? 'динамический диапазон (центр 128)'
                      : 'ядро нулевое, перезапись без изменений'}
                </div>
              </>
            ) : (
              <div className="kernel-sum-warn">{errors.kernel ?? 'Введите ядро.'}</div>
            )}
          </div>

          <div className="kernel-grid-3">
            {kernelStr.map((v, i) => (
              <input
                key={i}
                className="kernel-cell"
                type="text"
                inputMode="decimal"
                value={v}
                disabled={applying}
                onChange={(e) => updateCell(i, e.target.value)}
                aria-label={`Элемент ядра [${(i % 3) - 1}, ${Math.floor(i / 3) - 1}]`}
              />
            ))}
          </div>

          <label className="num-input kernel-padding">
            <span>Заполнение края</span>
            <select
              value={padding}
              onChange={(e) => setPadding(e.target.value as PaddingMode)}
              disabled={applying}
            >
              {PADDING_MODES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="kernel-column kernel-column-right">
          <div className="kernel-section-label">Каналы</div>
          <div className="kernel-channels" aria-label="Каналы для применения фильтра">
            {(['red', 'green', 'blue', 'alpha'] as KernelChannel[]).map((ch) => {
              const active = channels.has(ch);
              const title =
                ch === 'red' ? 'Красный' :
                ch === 'green' ? 'Зелёный' :
                ch === 'blue' ? 'Синий' : 'Альфа';
              return (
                <button
                  type="button"
                  key={ch}
                  className={`channel-chip ${active ? 'on' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleChannel(ch)}
                  disabled={applying}
                  title={title}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              );
            })}
          </div>
          {errors.channels ? <small className="field-error">{errors.channels}</small> : null}

          <label className="preview-checkbox kernel-preview">
            <input
              type="checkbox"
              checked={previewEnabled}
              disabled={applying}
              onChange={(e) => setPreviewEnabled(e.target.checked)}
            />
            <span>Предпросмотр</span>
          </label>

          {progress ? (
            <div className="kernel-progress">
              <div className="kernel-progress-bar" style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }} />
              <span className="kernel-progress-label">
                {progress.done} / {progress.total} строк
              </span>
            </div>
          ) : null}

          <div className="kernel-legend">
            <p>
              <b>Тождественное:</b> центр = 1, остальное 0.
              <br />
              <b>Повышение резкости:</b> 5× центр − 4 соседей.
              <br />
              <b>Гаусс 3×3 / Box:</b> размытие, нормализуются по сумме.
              <br />
              <b>Прюитт X/Y:</b> выделяют границы по оси, нормализация через |Σ|.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
