import { useEffect, useRef, useState } from 'react';
import { calculateHistogram, normalizeHistogram, calculateMasterHistogram } from './histogram';
import type { PixelImage } from './gb7';
import type { Channel } from './color';
import type { LevelsSettings, LevelsState } from './levels';
import { DEFAULT_LEVELS } from './levels';

type HistogramProps = {
  image: PixelImage;
  channel: 'master' | Channel;
  grayscale: boolean;
  logarithmic: boolean;
};

/**
 * Histogram visualization component
 */
export function Histogram({ image, channel, grayscale, logarithmic }: HistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate histogram
    const histData =
      channel === 'master'
        ? calculateMasterHistogram(image, grayscale, 256)
        : calculateHistogram(image, channel as Channel, grayscale, 256);

    const normalized = normalizeHistogram(histData, logarithmic);

    // Clear canvas
    ctx.fillStyle = '#0d111c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw histogram
    const barWidth = canvas.width / normalized.length;
    const maxHeight = canvas.height * 0.85;

    // Determine color for histogram line
    let lineColor = '#b9c5de';
    if (channel === 'red') lineColor = '#ff6b6b';
    else if (channel === 'green') lineColor = '#51cf66';
    else if (channel === 'blue') lineColor = '#4dabf7';
    else if (channel === 'alpha') lineColor = '#a78bfa';

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < normalized.length; i++) {
      const x = i * barWidth + barWidth / 2;
      const y = canvas.height - 10 - normalized[i] * maxHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw axis labels
    ctx.fillStyle = '#8ca4d8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', 10, canvas.height - 2);
    ctx.fillText('255', canvas.width - 10, canvas.height - 2);
  }, [image, channel, grayscale, logarithmic]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={120}
      className="histogram-canvas"
      aria-label="Histogram"
    />
  );
}

type InputLevelsProps = {
  settings: LevelsSettings;
  onChange: (settings: LevelsSettings) => void;
  maxValue?: number;
};

/**
 * Input Levels slider component with three handles
 */
export function InputLevels({ settings, onChange, maxValue = 255 }: InputLevelsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleBlackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(parseInt(e.target.value), settings.white - 1);
    onChange({ ...settings, black: value });
  };

  const handleWhiteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(parseInt(e.target.value), settings.black + 1);
    onChange({ ...settings, white: value });
  };

  const handleGammaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(0.1, Math.min(9.9, parseFloat(e.target.value)));
    onChange({ ...settings, gamma: parseFloat(value.toFixed(2)) });
  };

  return (
    <div ref={containerRef} className="input-levels">
      <div className="input-levels-sliders">
        <div className="slider-group">
          <label>Black Point</label>
          <input
            type="range"
            min="0"
            max={maxValue}
            value={settings.black}
            onChange={handleBlackChange}
            className="slider"
            aria-label="Black point"
          />
          <span className="slider-value">{settings.black}</span>
        </div>

        <div className="slider-group">
          <label>Gamma</label>
          <input
            type="range"
            min="0.1"
            max="9.9"
            step="0.1"
            value={settings.gamma}
            onChange={handleGammaChange}
            className="slider"
            aria-label="Gamma"
          />
          <span className="slider-value">{settings.gamma.toFixed(2)}</span>
        </div>

        <div className="slider-group">
          <label>White Point</label>
          <input
            type="range"
            min="0"
            max={maxValue}
            value={settings.white}
            onChange={handleWhiteChange}
            className="slider"
            aria-label="White point"
          />
          <span className="slider-value">{settings.white}</span>
        </div>
      </div>
    </div>
  );
}

type LevelsDialogProps = {
  open: boolean;
  image: PixelImage;
  grayscale: boolean;
  hasAlpha: boolean;
  state: LevelsState;
  onStateChange: (state: LevelsState) => void;
  onApply: () => void;
  onCancel: () => void;
  onPreviewChange: (preview: boolean) => void;
  preview: boolean;
};

/**
 * Levels adjustment dialog component
 */
export function LevelsDialog({
  open,
  image,
  grayscale,
  hasAlpha,
  state,
  onStateChange,
  onApply,
  onCancel,
  onPreviewChange,
  preview,
}: LevelsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedChannel, setSelectedChannel] = useState<'master' | Channel>('master');
  const [logarithmic, setLogarithmic] = useState(false);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  const channelOptions: Array<'master' | Channel> = grayscale
    ? hasAlpha
      ? (['master', 'gray', 'alpha'] as const)
      : (['master', 'gray'] as const)
    : hasAlpha
      ? (['master', 'red', 'green', 'blue', 'alpha'] as const)
      : (['master', 'red', 'green', 'blue'] as const);

  const getChannelLabel = (ch: string): string => {
    const labels: Record<string, string> = {
      master: 'Master',
      gray: 'Яркость',
      red: 'Красный',
      green: 'Зелёный',
      blue: 'Синий',
      alpha: 'Альфа',
    };
    return labels[ch] || ch;
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedChannel(e.target.value as 'master' | Channel);
  };

  const currentSettings: LevelsSettings =
    selectedChannel === 'master'
      ? state.master
      : selectedChannel === 'gray'
        ? state.red // For grayscale, use red channel
        : selectedChannel === 'red'
          ? state.red
          : selectedChannel === 'green'
            ? state.green
            : selectedChannel === 'blue'
              ? state.blue
              : state.alpha;

  const handleSettingsChange = (settings: LevelsSettings) => {
    const newState = { ...state };

    if (selectedChannel === 'master') {
      newState.master = settings;
      newState.red = settings;
      newState.green = settings;
      newState.blue = settings;
    } else if (selectedChannel === 'gray') {
      newState.red = settings; // For grayscale
    } else if (selectedChannel === 'red') {
      newState.red = settings;
    } else if (selectedChannel === 'green') {
      newState.green = settings;
    } else if (selectedChannel === 'blue') {
      newState.blue = settings;
    } else if (selectedChannel === 'alpha') {
      newState.alpha = settings;
    }

    onStateChange(newState);
  };

  const handleReset = () => {
    const newState = { ...state };

    if (selectedChannel === 'master') {
      newState.master = { ...DEFAULT_LEVELS };
      newState.red = { ...DEFAULT_LEVELS };
      newState.green = { ...DEFAULT_LEVELS };
      newState.blue = { ...DEFAULT_LEVELS };
    } else if (selectedChannel === 'gray') {
      newState.red = { ...DEFAULT_LEVELS };
    } else if (selectedChannel === 'red') {
      newState.red = { ...DEFAULT_LEVELS };
    } else if (selectedChannel === 'green') {
      newState.green = { ...DEFAULT_LEVELS };
    } else if (selectedChannel === 'blue') {
      newState.blue = { ...DEFAULT_LEVELS };
    } else if (selectedChannel === 'alpha') {
      newState.alpha = { ...DEFAULT_LEVELS };
    }

    onStateChange(newState);
  };

  return (
    <dialog ref={dialogRef} className="levels-dialog">
      <div className="levels-dialog-content">
        <div className="levels-dialog-header">
          <h2>Уровни</h2>
          <button
            className="close-button"
            onClick={onCancel}
            aria-label="Закрыть диалог"
          >
            ✕
          </button>
        </div>

        <div className="levels-controls">
          <div className="levels-row">
            <label htmlFor="channel-select">Канал:</label>
            <select
              id="channel-select"
              value={selectedChannel}
              onChange={handleChannelChange}
              className="channel-select"
            >
              {channelOptions.map((ch) => (
                <option key={ch} value={ch}>
                  {getChannelLabel(ch)}
                </option>
              ))}
            </select>

            <label htmlFor="histogram-mode" style={{ marginLeft: '20px' }}>
              <input
                id="histogram-mode"
                type="checkbox"
                checked={logarithmic}
                onChange={(e) => setLogarithmic(e.target.checked)}
              />
              Логарифмическая шкала
            </label>
          </div>

          <div className="levels-row">
            <Histogram
              image={image}
              channel={selectedChannel}
              grayscale={grayscale}
              logarithmic={logarithmic}
            />
          </div>

          <div className="levels-row">
            <InputLevels
              settings={currentSettings}
              onChange={handleSettingsChange}
              maxValue={255}
            />
          </div>

          <div className="levels-row">
            <label className="preview-checkbox">
              <input
                type="checkbox"
                checked={preview}
                onChange={(e) => onPreviewChange(e.target.checked)}
              />
              Предпросмотр
            </label>
          </div>

          <div className="levels-buttons">
            <button onClick={handleReset} className="button-secondary">
              Сброс
            </button>
            <button onClick={onCancel} className="button-secondary">
              Отмена
            </button>
            <button onClick={onApply} className="button-primary">
              Применить
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
