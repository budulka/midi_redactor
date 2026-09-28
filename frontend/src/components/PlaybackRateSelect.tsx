import { formatPlaybackRate, PLAYBACK_RATES } from '../utils/playbackRate.ts';

interface PlaybackRateSelectProps {
  /** Accessible name of the select. */
  label: string;
  value: number;
  onChange(rate: number): void;
  disabled?: boolean;
}

/** Playback speed selector with the fixed 0.25×–2× steps. */
export default function PlaybackRateSelect({
  label,
  value,
  onChange,
  disabled = false,
}: PlaybackRateSelectProps) {
  return (
    <label className="rate-select">
      Speed{' '}
      <select
        aria-label={label}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {PLAYBACK_RATES.map((rate) => (
          <option key={rate} value={String(rate)}>
            {formatPlaybackRate(rate)}
          </option>
        ))}
      </select>
    </label>
  );
}
