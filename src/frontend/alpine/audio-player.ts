// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Audio player component — the Alpine scope behind one `<audio-player>`
 * element (markup: `src/components/audio-player.html`).
 *
 * One element plays one track; several elements on a page play at the same
 * time (ambient + TTS + music). The scope owns transport controls
 * (play/pause/stop), a volume slider with a mute toggle, playback speed
 * (0.5x–2.0x), a loop toggle, a seekable progress bar, and keyboard
 * shortcuts (space = play/pause, left/right arrows = seek).
 *
 * The remembered volume lives in localStorage so the preference survives a
 * reload. Track URLs are asset raw URLs (`/api/v1/assets/<id>/raw`), the
 * shape the ambient-generation route returns.
 */
import type { AlpineState, } from "./types";

/** Slowest playback speed the speed control offers. */
export const MIN_SPEED = 0.5;
/** Fastest playback speed the speed control offers. */
export const MAX_SPEED = 2;
/** localStorage key holding the remembered volume (0..1). */
export const VOLUME_STORAGE_KEY = "loop-lore.audio-player.volume";
/** Speed presets cycled by the speed button. */
export const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2,] as const;

/** Options accepted by the player factory. */
export interface AudioPlayerOptions {
  /** Audio URL — an asset raw URL (`/api/v1/assets/<id>/raw`). Optional so a
   * player can be mounted before its track is known. */
  src?: string;
  /** Accessible label for the player. */
  label?: string;
  /** Start playback once the element reports its metadata. */
  autoplay?: boolean;
  /** Loop the track (ambient / music). */
  loop?: boolean;
  /** Initial volume 0..1 (defaults to the remembered preference). */
  volume?: number;
  /** Initial playback speed (0.5..2). */
  speed?: number;
}

/** Alpine scope of the `<audio-player>` component. */
export interface AudioPlayerState {
  /** Current track URL. */
  src: string;
  /** Accessible label for the player. */
  label: string;
  /** True while the track is playing. */
  playing: boolean;
  /** True once the element reported its metadata. */
  ready: boolean;
  /** Playback position in seconds. */
  currentTime: number;
  /** Track length in seconds (0 until the metadata arrives). */
  duration: number;
  /** Volume 0..1. */
  volume: number;
  /** Muted flag. */
  muted: boolean;
  /** Playback speed (0.5..2). */
  speed: number;
  /** Loop flag. */
  loop: boolean;
  /** Last failure message (empty when healthy). */
  error: string;
  /** Play (or resume) the track. */
  play(): void;
  /** Pause the track. */
  pause(): void;
  /** Pause and rewind to the start. */
  stop(): void;
  /** Toggle between play and pause. */
  toggle(): void;
  /** Seek to an absolute position (clamped to the track). */
  seekTo(seconds: number,): void;
  /** Seek relative to the current position. */
  nudge(deltaSeconds: number,): void;
  /** Set the volume (0..1) and remember it. */
  setVolume(value: number,): void;
  /** Toggle the mute flag. */
  toggleMute(): void;
  /** Set the playback speed (0.5..2). */
  setSpeed(value: number,): void;
  /** Step to the next speed preset. */
  cycleSpeed(): void;
  /** Toggle looping. */
  toggleLoop(): void;
  /** Keyboard handler: space = play/pause, arrows = seek. */
  handleKey(event: KeyboardEvent,): void;
  /** `timeupdate` handler. */
  onTimeUpdate(): void;
  /** `loadedmetadata` handler. */
  onLoadedMetadata(): void;
  /** `ended` handler. */
  onEnded(): void;
  /** `error` handler. */
  onError(): void;
  /** The bound `<audio>` element, when the markup provides one. */
  _audio(): HTMLAudioElement | undefined;
}

/**
 * Read the remembered volume.
 * @returns the stored volume 0..1, or null when nothing usable is stored.
 */
function readStoredVolume(): number | null {
  if (typeof localStorage === "undefined") { return null; }
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY,);
    if (raw === null) { return null; }
    const parsed = Number.parseFloat(raw,);
    if (!Number.isFinite(parsed,)) { return null; }
    return Math.min(Math.max(parsed, 0,), 1,);
  } catch {
    return null;
  }
}

/**
 * Remember the volume for the next page load.
 * @param value - volume 0..1
 */
function storeVolume(value: number,): void {
  if (typeof localStorage === "undefined") { return; }
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(value,),);
  } catch {
    /* storage unavailable (private mode / quota) — the player still works */
  }
}

/**
 * Build the Alpine scope for one `<audio-player>` element.
 * @param options - track URL plus initial control state
 * @returns the player scope
 */
export function audioPlayerFactory(options: AudioPlayerOptions = {},): AlpineState<AudioPlayerState> {
  const autoplay = options.autoplay ?? false;
  const stored = readStoredVolume();

  return {
    src: options.src ?? "",
    label: options.label ?? "",
    playing: false,
    ready: false,
    currentTime: 0,
    duration: 0,
    volume: Math.min(Math.max(options.volume ?? stored ?? 1, 0,), 1,),
    muted: false,
    speed: Math.min(Math.max(options.speed ?? 1, MIN_SPEED,), MAX_SPEED,),
    loop: options.loop ?? false,
    error: "",

    /**
     * @returns {void}
     */
    _audio(): HTMLAudioElement | undefined {
      const el = this.$refs?.audio;
      return el as HTMLAudioElement | undefined;
    },

    /**
     * @returns {void}
     */
    play(): void {
      const audio = this._audio();
      if (!audio) {
        this.error = "audio element missing";
        return;
      }

      this.error = "";
      const started = audio.play();
      if (started && typeof started.catch === "function") {
        started.catch(() => {
          this.error = "playback was blocked";
          this.playing = false;
        },);
      }

      this.playing = true;
    },

    /**
     * @returns {void}
     */
    pause(): void {
      this._audio()?.pause();
      this.playing = false;
    },

    /**
     * @returns {void}
     */
    stop(): void {
      const audio = this._audio();
      audio?.pause();
      if (audio) { audio.currentTime = 0; }
      this.currentTime = 0;
      this.playing = false;
    },

    /**
     * @returns {void}
     */
    toggle(): void {
      if (this.playing) { this.pause(); }
      else { this.play(); }
    },

    /**
     * @param seconds
     * @returns {void}
     */
    seekTo(seconds: number,): void {
      const limit = this.duration > 0 ? this.duration : Number.MAX_SAFE_INTEGER;
      const target = Math.min(Math.max(Number.isFinite(seconds,) ? seconds : 0, 0,), limit,);
      const audio = this._audio();
      if (audio) { audio.currentTime = target; }
      this.currentTime = target;
    },

    /**
     * @param deltaSeconds
     * @returns {void}
     */
    nudge(deltaSeconds: number,): void {
      this.seekTo(this.currentTime + deltaSeconds,);
    },

    /**
     * @param value
     * @returns {void}
     */
    setVolume(value: number,): void {
      const volume = Math.min(Math.max(Number.isFinite(value,) ? value : 0, 0,), 1,);
      this.volume = volume;
      const audio = this._audio();
      if (audio) { audio.volume = volume; }
      storeVolume(volume,);
    },

    /**
     * @returns {void}
     */
    toggleMute(): void {
      this.muted = !this.muted;
      const audio = this._audio();
      if (audio) { audio.muted = this.muted; }
    },

    /**
     * @param value
     * @returns {void}
     */
    setSpeed(value: number,): void {
      const speed = Math.min(Math.max(Number.isFinite(value,) ? value : 1, MIN_SPEED,), MAX_SPEED,);
      this.speed = speed;
      const audio = this._audio();
      if (audio) { audio.playbackRate = speed; }
    },

    /**
     * @returns {void}
     */
    cycleSpeed(): void {
      const index = SPEED_PRESETS.indexOf(this.speed as (typeof SPEED_PRESETS)[number],);
      const next = SPEED_PRESETS[(index + 1) % SPEED_PRESETS.length] ?? 1;
      this.setSpeed(next,);
    },

    /**
     * @returns {void}
     */
    toggleLoop(): void {
      this.loop = !this.loop;
      const audio = this._audio();
      if (audio) { audio.loop = this.loop; }
    },

    /**
     * @param event
     * @returns {void}
     */
    handleKey(event: KeyboardEvent,): void {
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        this.toggle();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.nudge(-5,);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.nudge(5,);
      }
    },

    /**
     * @returns {void}
     */
    onTimeUpdate(): void {
      const audio = this._audio();
      if (audio) { this.currentTime = audio.currentTime; }
    },

    /**
     * @returns {void}
     */
    onLoadedMetadata(): void {
      const audio = this._audio();
      if (!audio) { return; }
      this.duration = audio.duration;
      this.ready = true;
      audio.volume = this.volume;
      audio.muted = this.muted;
      audio.loop = this.loop;
      audio.playbackRate = this.speed;
      if (autoplay) { this.play(); }
    },

    /**
     * @returns {void}
     */
    onEnded(): void {
      this.playing = false;
    },

    /**
     * @returns {void}
     */
    onError(): void {
      this.error = "audio failed to load";
      this.playing = false;
    },
  };
}

(globalThis as Record<string, unknown>).audioPlayerFactory = audioPlayerFactory;
