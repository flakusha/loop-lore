// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Minimal PCM WAV codec + layer mixing for generated audio.
 *
 * Mono float32 in, 16-bit PCM out — enough for ambient/SFX output where the
 * browser does the final playback mixing. decodeWav reads provider output
 * back so tests can assert on generated audio.
 */

/** Decoded mono PCM audio. */
export interface WavData {
  sampleRate: number;
  /** Mono samples normalized to [-1, 1]. */
  samples: Float32Array;
}

/** One decoded layer to mix into the output track. */
export interface MixLayer {
  data: WavData;
  /** Linear gain, >= 0. */
  volume: number;
  /** Fade-in length in seconds. */
  fadeInSec: number;
  /** Fade-out tail length in seconds. */
  fadeOutSec: number;
}

/**
 * Decode a 16-/32-bit PCM or 32-bit-float WAV buffer to mono.
 * @param buffer
 * @returns The decoded mono track.
 * @throws {Error} When the buffer is not a RIFF/WAVE file, lacks `fmt `/`data`
 * chunks, has more than 2 channels, or uses an unsupported bit depth.
 */
export function decodeWav(buffer: Buffer,): WavData {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4,) !== "RIFF" || buffer.toString("ascii", 8, 12,) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE buffer",);
  }

  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 44_100;
  let bitsPerSample = 16;
  let dataStart = -1;
  let dataEnd = -1;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4,);
    const size = buffer.readUInt32LE(offset + 4,);
    const body = offset + 8;
    if (id === "fmt ") {
      audioFormat = buffer.readUInt16LE(body,);
      channels = buffer.readUInt16LE(body + 2,);
      sampleRate = buffer.readUInt32LE(body + 4,);
      bitsPerSample = buffer.readUInt16LE(body + 14,);
    } else if (id === "data") {
      dataStart = body;
      dataEnd = Math.min(body + size, buffer.length,);
    }

    offset = body + size + (size % 2);
  }

  if (dataStart < 0) { throw new Error("WAV buffer has no data chunk",); }
  if (channels < 1 || channels > 2) { throw new Error(`Unsupported WAV channel count: ${channels}`,); }

  const bytesPerFrame = channels * (bitsPerSample / 8);
  if (bytesPerFrame <= 0 || !Number.isInteger(bytesPerFrame,)) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`,);
  }

  const frames = Math.floor((dataEnd - dataStart) / bytesPerFrame,);
  const samples = new Float32Array(frames,);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const p = dataStart + (i * channels + c) * (bitsPerSample / 8);
      if (bitsPerSample === 16) {
        sum += buffer.readInt16LE(p,) / 32_768;
      } else if (bitsPerSample === 32) {
        sum += audioFormat === 3 ? buffer.readFloatLE(p,) : buffer.readInt32LE(p,) / 2_147_483_648;
      } else {
        throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`,);
      }
    }

    samples[i] = sum / channels;
  }

  return { sampleRate, samples, };
}

/**
 * Encode mono samples as a 16-bit PCM WAV file.
 * @param data
 * @returns The WAV bytes.
 */
export function encodeWav(data: WavData,): Buffer {
  const bytesPerSample = 2;
  const dataSize = data.samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize,);

  buffer.write("RIFF", 0, "ascii",);
  buffer.writeUInt32LE(36 + dataSize, 4,);
  buffer.write("WAVE", 8, "ascii",);
  buffer.write("fmt ", 12, "ascii",);
  buffer.writeUInt32LE(16, 16,);
  buffer.writeUInt16LE(1, 20,);
  buffer.writeUInt16LE(1, 22,);
  buffer.writeUInt32LE(data.sampleRate, 24,);
  buffer.writeUInt32LE(data.sampleRate * bytesPerSample, 28,);
  buffer.writeUInt16LE(bytesPerSample, 32,);
  buffer.writeUInt16LE(16, 34,);
  buffer.write("data", 36, "ascii",);
  buffer.writeUInt32LE(dataSize, 40,);

  for (let i = 0; i < data.samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, data.samples[i]!,),);
    buffer.writeInt16LE(Math.round(clamped * 32_767,), 44 + i * bytesPerSample,);
  }

  return buffer;
}

/**
 * Mix layers into one mono track of exactly `durationSec` seconds, applying
 * per-layer gain and edge fades (the fades are what the player crossfades on a
 * scene change). Output is clamped to [-1, 1].
 * @param opts
 * @returns Mixed samples ready for `encodeWav`.
 */
export function mixLayers(opts: { layers: MixLayer[]; durationSec: number; sampleRate: number },): WavData {
  const total = Math.max(1, Math.round(opts.durationSec * opts.sampleRate,),);
  const out = new Float32Array(total,);

  for (const layer of opts.layers) {
    const n = Math.min(layer.data.samples.length, total,);
    const fadeIn = Math.round(layer.fadeInSec * opts.sampleRate,);
    const fadeOut = Math.round(layer.fadeOutSec * opts.sampleRate,);
    for (let i = 0; i < n; i++) {
      let gain = layer.volume;
      if (fadeIn > 0 && i < fadeIn) { gain *= i / fadeIn; }
      if (fadeOut > 0 && i >= n - fadeOut) { gain *= Math.max(0, (n - i) / fadeOut,); }
      out[i]! += layer.data.samples[i]! * gain;
    }
  }

  for (let i = 0; i < total; i++) {
    out[i]! = Math.max(-1, Math.min(1, out[i]!,),);
  }

  return { sampleRate: opts.sampleRate, samples: out, };
}
