import type {
  CreateWaveformView,
  CreateWaveformViewOptions,
  WaveformView,
} from '../waveformView.ts';

/** Test double of a waveform view: remembers its options and fires the view events. */
export class FakeWaveformView implements WaveformView {
  destroyed = false;

  constructor(readonly options: CreateWaveformViewOptions) {}

  destroy(): void {
    this.destroyed = true;
  }

  emitReady(): void {
    this.options.events.onReady();
  }

  emitSeek(time: number): void {
    this.options.events.onSeek(time);
  }

  emitError(error: Error = new Error('decode failed')): void {
    this.options.events.onError(error);
  }
}

export function createFakeWaveformViews(): {
  create: CreateWaveformView;
  views: FakeWaveformView[];
} {
  const views: FakeWaveformView[] = [];
  const create: CreateWaveformView = (options) => {
    const view = new FakeWaveformView(options);
    views.push(view);
    return view;
  };
  return { create, views };
}
