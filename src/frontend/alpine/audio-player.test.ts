// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  audioPlayerFactory,
  type AudioPlayerState,
  MAX_SPEED,
  MIN_SPEED,
  SPEED_PRESETS,
  VOLUME_STORAGE_KEY,
} from "./audio-player";

/** Minimal stand-in for the `<audio>` element the markup binds via `x-ref`. */
interface FakeAudio {
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  loop: boolean;
  playCount: number;
  pauseCount: number;
  play(): Promise<void>;
  pause(): void;
}

function fakeAudio(overrides: Partial<FakeAudio> = {},): FakeAudio {
  return {
    currentTime: 0,
    duration: 120,
    volume: 1,
    muted: false,
    playbackRate: 1,
    loop: false,
    playCount: 0,
    pauseCount: 0,
    play(): Promise<void> {
      this.playCount += 1;
      return Promise.resolve();
    },
    pause(): void {
      this.pauseCount += 1;
    },
    ...overrides,
  };
}

/** Scope plus the Alpine magics the component reads. */
type TestScope = AudioPlayerState & {
  $refs: Record<string, HTMLElement>;
  $dispatch: (event: string, detail?: unknown,) => void;
  $nextTick: (callback?: () => void,) => Promise<void>;
  $el: HTMLElement;
};

function scopeWith(audio?: FakeAudio,): TestScope {
  const scope = audioPlayerFactory({ src: "/api/v1/assets/1/raw", },) as unknown as TestScope;
  scope.$refs = audio ? { audio: audio as unknown as HTMLElement, } : {};
  scope.$dispatch = () => {};
  scope.$nextTick = async () => {};
  scope.$el = {} as HTMLElement;
  return scope;
}

function keyEvent(key: string,): KeyboardEvent {
  return { key, preventDefault: () => {}, } as unknown as KeyboardEvent;
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage",);
const store = new Map<string, string>();

describe("audioPlayerFactory", () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string,) => store.get(key,) ?? null,
        setItem: (key: string, value: string,) => {
          store.set(key, value,);
        },
      },
      configurable: true,
      writable: true,
    },);
  },);

  afterEach(() => {
    if (originalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalStorage,);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage",);
    }
  },);

  test("starts idle with the track URL", () => {
    const scope = scopeWith();

    expect(scope.src,).toBe("/api/v1/assets/1/raw",);
    expect(scope.playing,).toBe(false,);
    expect(scope.duration,).toBe(0,);
    expect(scope.volume,).toBe(1,);
    expect(scope.speed,).toBe(1,);
    expect(scope.error,).toBe("",);
  });

  test("play starts the element and pause stops it", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);

    scope.play();
    expect(audio.playCount,).toBe(1,);
    expect(scope.playing,).toBe(true,);

    scope.pause();
    expect(audio.pauseCount,).toBe(1,);
    expect(scope.playing,).toBe(false,);
  });

  test("play without a bound element reports an error", () => {
    const scope = scopeWith();

    scope.play();

    expect(scope.playing,).toBe(false,);
    expect(scope.error,).toBe("audio element missing",);
  });

  test("toggle flips between play and pause", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);

    scope.toggle();
    expect(scope.playing,).toBe(true,);

    scope.toggle();
    expect(scope.playing,).toBe(false,);
    expect(audio.pauseCount,).toBe(1,);
  });

  test("stop pauses and rewinds to the start", () => {
    const audio = fakeAudio({ currentTime: 42, },);
    const scope = scopeWith(audio,);
    scope.currentTime = 42;

    scope.stop();

    expect(audio.pauseCount,).toBe(1,);
    expect(audio.currentTime,).toBe(0,);
    expect(scope.currentTime,).toBe(0,);
    expect(scope.playing,).toBe(false,);
  });

  test("seek clamps to the track and mirrors onto the element", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);
    scope.onLoadedMetadata();

    scope.seekTo(999,);
    expect(scope.currentTime,).toBe(audio.duration,);

    scope.seekTo(-5,);
    expect(scope.currentTime,).toBe(0,);
    expect(audio.currentTime,).toBe(0,);
  });

  test("volume clamps to 0..1, mirrors onto the element and is remembered", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);

    scope.setVolume(2,);
    expect(scope.volume,).toBe(1,);
    expect(audio.volume,).toBe(1,);

    scope.setVolume(-1,);
    expect(scope.volume,).toBe(0,);
    expect(audio.volume,).toBe(0,);

    scope.setVolume(0.4,);
    expect(scope.volume,).toBe(0.4,);
    expect(store.get(VOLUME_STORAGE_KEY,),).toBe("0.4",);
  });

  test("a remembered volume is reused by the next player", () => {
    store.set(VOLUME_STORAGE_KEY, "0.25",);

    const scope = scopeWith();

    expect(scope.volume,).toBe(0.25,);
  });

  test("mute toggles the element flag", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);

    scope.toggleMute();
    expect(scope.muted,).toBe(true,);
    expect(audio.muted,).toBe(true,);

    scope.toggleMute();
    expect(scope.muted,).toBe(false,);
    expect(audio.muted,).toBe(false,);
  });

  test("speed clamps between 0.5x and 2x and mirrors onto the element", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);

    scope.setSpeed(9,);
    expect(scope.speed,).toBe(MAX_SPEED,);
    expect(audio.playbackRate,).toBe(MAX_SPEED,);

    scope.setSpeed(0.1,);
    expect(scope.speed,).toBe(MIN_SPEED,);
    expect(audio.playbackRate,).toBe(MIN_SPEED,);
  });

  test("cycleSpeed walks the presets and wraps around", () => {
    const scope = scopeWith();

    const seen: number[] = [];
    for (let i = 0; i < SPEED_PRESETS.length; i += 1) {
      scope.cycleSpeed();
      seen.push(scope.speed,);
    }

    expect(seen,).toEqual([1.25, 1.5, 2, 0.5, 0.75, 1,],);
    expect(scope.speed,).toBe(1,);
  });

  test("loop toggles the element flag", () => {
    const audio = fakeAudio();
    const scope = scopeWith(audio,);

    scope.toggleLoop();
    expect(scope.loop,).toBe(true,);
    expect(audio.loop,).toBe(true,);
  });

  test("space toggles playback and the arrows seek by five seconds", () => {
    const audio = fakeAudio({ currentTime: 10, },);
    const scope = scopeWith(audio,);
    scope.currentTime = 10;

    scope.handleKey(keyEvent(" ",),);
    expect(scope.playing,).toBe(true,);

    scope.handleKey(keyEvent("ArrowRight",),);
    expect(scope.currentTime,).toBe(15,);

    scope.handleKey(keyEvent("ArrowLeft",),);
    expect(scope.currentTime,).toBe(10,);

    scope.handleKey(keyEvent("a",),);
    expect(scope.currentTime,).toBe(10,);
  });

  test("metadata applies the control state and starts autoplay", () => {
    const audio = fakeAudio({ duration: 200, },);
    const scope = audioPlayerFactory({
      src: "/api/v1/assets/2/raw",
      autoplay: true,
      loop: true,
      volume: 0.3,
      speed: 1.5,
    },) as unknown as TestScope;

    scope.$refs = { audio: audio as unknown as HTMLElement, };
    scope.$dispatch = () => {};
    scope.$nextTick = async () => {};
    scope.$el = {} as HTMLElement;

    scope.onLoadedMetadata();

    expect(scope.ready,).toBe(true,);
    expect(scope.duration,).toBe(200,);
    expect(audio.volume,).toBe(0.3,);
    expect(audio.playbackRate,).toBe(1.5,);
    expect(audio.loop,).toBe(true,);
    expect(scope.playing,).toBe(true,);
  });

  test("time updates follow the element and the end stops playback", () => {
    const audio = fakeAudio({ currentTime: 33, },);
    const scope = scopeWith(audio,);

    scope.onTimeUpdate();
    expect(scope.currentTime,).toBe(33,);

    scope.playing = true;
    scope.onEnded();
    expect(scope.playing,).toBe(false,);
  });

  test("a load failure surfaces an error", () => {
    const scope = scopeWith();

    scope.onError();

    expect(scope.error,).toBe("audio failed to load",);
    expect(scope.playing,).toBe(false,);
  });
});
