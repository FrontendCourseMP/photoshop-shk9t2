import { useEffect, useMemo, useState } from 'react';
import type { PixelImage } from './gb7';
import { Modal } from './Modal';
import {
  clampZoom,
  INTERPOLATION_METHODS,
  megapixels,
  resizeImage,
  RESIZE_MAX_DIM,
  RESIZE_MIN_DIM,
  ZOOM_MAX,
  ZOOM_MIN,
  type InterpolationMethod,
} from './scale';

type Unit = 'percent' | 'pixels';

const METHOD_LABELS: Record<InterpolationMethod, string> = {
  bilinear: 'Билинейная',
  nearest: 'Ближайший сосед',
};

const METHOD_DESCRIPTIONS: Record<InterpolationMethod, string> = {
  bilinear:
    'Билинейная интерполяция — усредняет 4 соседних пикселя (2×2). Даёт плавное, сглаженное изображение без ступенек. По умолчанию для фотографий и обычного масштабирования.',
  nearest:
    'Метод ближайшего соседа — берёт значение ближайшего пикселя без сглаживания. Работает очень быстро, сохраняет чёткие границы (идеально для пиксель-арта, скриншотов с текстом), но даёт ступенчатые края на фотографиях.',
};

export type ResizeDialogProps = {
  image: PixelImage;
  onClose: () => void;
  onApply: (image: PixelImage) => void;
};

const PERCENT_MIN = ZOOM_MIN;
const PERCENT_MAX = ZOOM_MAX * 10;

export function ResizeDialog({ image, onClose, onApply }: ResizeDialogProps) {
  const aspect = image.width / image.height;

  const [unit, setUnit] = useState<Unit>('percent');
  const [widthVal, setWidthVal] = useState<string>('100');
  const [heightVal, setHeightVal] = useState<string>('100');
  const [lockAspect, setLockAspect] = useState(true);
  const [method, setMethod] = useState<InterpolationMethod>('bilinear');
  const [errors, setErrors] = useState<{ w?: string; h?: string }>({});

  const pxSize = useMemo(() => {
    if (unit === 'pixels') {
      const w = parseInt(widthVal, 10);
      const h = parseInt(heightVal, 10);
      return { w: Number.isFinite(w) ? w : image.width, h: Number.isFinite(h) ? h : image.height };
    }
    const wp = clampZoom(parseFloat(widthVal) || 100);
    const hp = lockAspect ? wp : clampZoom(parseFloat(heightVal) || 100);
    return {
      w: Math.max(1, Math.round((image.width * wp) / 100)),
      h: Math.max(1, Math.round((image.height * hp) / 100)),
    };
  }, [unit, widthVal, heightVal, lockAspect, image.width, image.height]);

  useEffect(() => {
    const nextErrors: { w?: string; h?: string } = {};
    if (unit === 'pixels') {
      const w = parseInt(widthVal, 10);
      const h = parseInt(heightVal, 10);
      if (!Number.isInteger(w) || w < RESIZE_MIN_DIM || w > RESIZE_MAX_DIM) {
        nextErrors.w = `Ширина: целое от ${RESIZE_MIN_DIM} до ${RESIZE_MAX_DIM} px`;
      }
      if (!Number.isInteger(h) || h < RESIZE_MIN_DIM || h > RESIZE_MAX_DIM) {
        nextErrors.h = `Высота: целое от ${RESIZE_MIN_DIM} до ${RESIZE_MAX_DIM} px`;
      }
    } else {
      const wp = parseFloat(widthVal);
      const hp = parseFloat(heightVal);
      if (!Number.isFinite(wp) || wp < PERCENT_MIN || wp > PERCENT_MAX) {
        nextErrors.w = `Ширина: от ${PERCENT_MIN}% до ${PERCENT_MAX}%`;
      }
      if (!lockAspect && (!Number.isFinite(hp) || hp < PERCENT_MIN || hp > PERCENT_MAX)) {
        nextErrors.h = `Высота: от ${PERCENT_MIN}% до ${PERCENT_MAX}%`;
      }
    }
    setErrors(nextErrors);
  }, [unit, widthVal, heightVal, lockAspect]);

  const updateWidth = (raw: string) => {
    setWidthVal(raw);
    if (lockAspect) {
      if (unit === 'percent') {
        setHeightVal(raw);
      } else {
        const w = parseInt(raw, 10);
        if (Number.isInteger(w) && w > 0 && aspect > 0) {
          setHeightVal(String(Math.max(1, Math.round(w / aspect))));
        }
      }
    }
  };

  const updateHeight = (raw: string) => {
    setHeightVal(raw);
    if (lockAspect) {
      if (unit === 'percent') {
        setWidthVal(raw);
      } else {
        const h = parseInt(raw, 10);
        if (Number.isInteger(h) && h > 0 && aspect > 0) {
          setWidthVal(String(Math.max(1, Math.round(h * aspect))));
        }
      }
    }
  };

  const reset = () => {
    setUnit('percent');
    setWidthVal('100');
    setHeightVal('100');
    setLockAspect(true);
    setMethod('bilinear');
  };

  const hasErrors = Object.keys(errors).length > 0;

  const apply = () => {
    if (hasErrors) return;
    try {
      const next = resizeImage(image, { width: pxSize.w, height: pxSize.h, method });
      onApply(next);
      onClose();
    } catch (e) {
      setErrors({ w: e instanceof Error ? e.message : 'Ошибка масштабирования' });
    }
  };

  const footer = (
    <>
      <button type="button" className="levels-btn secondary" onClick={reset}>Сброс</button>
      <div className="levels-spacer" />
      <button type="button" className="levels-btn secondary" onClick={onClose}>Отмена</button>
      <button type="button" className="levels-btn primary" disabled={hasErrors} onClick={apply}>Применить</button>
    </>
  );

  const methodTooltip = METHOD_DESCRIPTIONS[method as keyof typeof METHOD_DESCRIPTIONS] ?? '';
  const methodLabel = METHOD_LABELS[method as keyof typeof METHOD_LABELS] ?? String(method);

  return (
    <Modal title="Изменить размер изображения" onClose={onClose} widthMax="620px" footer={footer}>
      <div className="resize-grid">
        <div className="resize-stat">
          <div className="resize-stat-label">До</div>
          <div className="resize-stat-value">{image.width} × {image.height} px</div>
          <div className="resize-stat-sub">{megapixels(image.width, image.height).toFixed(3)} МП</div>
        </div>
        <div className="resize-stat resize-stat-after">
          <div className="resize-stat-label">После</div>
          <div className="resize-stat-value">{pxSize.w} × {pxSize.h} px</div>
          <div className="resize-stat-sub">{megapixels(pxSize.w, pxSize.h).toFixed(3)} МП</div>
        </div>

        <label className="num-input resize-unit">
          <span>Единицы</span>
          <select value={unit} onChange={(e) => {
            const nextUnit = e.target.value as Unit;
            setUnit(nextUnit);
            if (nextUnit === 'percent') {
              const wp = Math.round((pxSize.w / image.width) * 100);
              const hp = Math.round((pxSize.h / image.height) * 100);
              setWidthVal(String(wp));
              setHeightVal(lockAspect ? String(wp) : String(hp));
            } else {
              setWidthVal(String(pxSize.w));
              setHeightVal(String(pxSize.h));
            }
          }}>
            <option value="percent">Проценты (%)</option>
            <option value="pixels">Пиксели (px)</option>
          </select>
        </label>

        <label className="num-input" style={{ gridColumn: '1 / 2' }}>
          <span>Ширина{unit === 'percent' ? ', %' : ', px'}</span>
          <input
            type="number"
            value={widthVal}
            onChange={(e) => updateWidth(e.target.value)}
            min={unit === 'percent' ? PERCENT_MIN : RESIZE_MIN_DIM}
            max={unit === 'percent' ? PERCENT_MAX : RESIZE_MAX_DIM}
            step={unit === 'percent' ? 1 : 1}
            aria-invalid={!!errors.w}
          />
          {errors.w ? <small className="field-error">{errors.w}</small> : null}
        </label>

        <label className="num-input" style={{ gridColumn: '2 / 3' }}>
          <span>Высота{unit === 'percent' ? ', %' : ', px'}</span>
          <input
            type="number"
            value={heightVal}
            onChange={(e) => updateHeight(e.target.value)}
            min={unit === 'percent' ? PERCENT_MIN : RESIZE_MIN_DIM}
            max={unit === 'percent' ? PERCENT_MAX : RESIZE_MAX_DIM}
            step={unit === 'percent' ? 1 : 1}
            disabled={lockAspect && unit === 'percent'}
            aria-invalid={!!errors.h}
          />
          {errors.h ? <small className="field-error">{errors.h}</small> : null}
        </label>

        <label className="lock-checkbox">
          <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
          <span>Сохранять пропорции ({aspect.toFixed(3)})</span>
        </label>

        <div className="method-row">
          <label className="num-input method-pick">
            <span>Алгоритм интерполяции</span>
            <div className="tooltip-wrap">
              <select value={method} onChange={(e) => setMethod(e.target.value as InterpolationMethod)}>
                {INTERPOLATION_METHODS.map((m) => (
                  <option key={m} value={m}>{METHOD_LABELS[m as keyof typeof METHOD_LABELS] ?? m}</option>
                ))}
              </select>
              <span className="tooltip" role="tooltip">
                <b>{methodLabel}.</b> {methodTooltip}
              </span>
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
}
