# Image & Video Generation Integration

## Overview

This spec covers image and video generation backends for loop-lore. Supports text-to-image, image-to-image, inpainting, text-to-video, and image-to-video workflows across multiple model families.

**Primary backend** (MVP):

| Backend                                                                | Type           | Best For                              |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------- |
| [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | Local, CPU/GPU | Default image generation, GGUF models |

**Future backends**:

| Backend                                              | Type              | Best For                            |
| ---------------------------------------------------- | ----------------- | ----------------------------------- |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | Local, node-based | Complex multi-step pipelines, video |
| Krea 2 API                                           | Cloud             | Style transfer, moodboards          |
| Ideogram 4 API                                       | Cloud             | Text rendering, structured prompts  |
| Qwen Image API                                       | Cloud             | Multilingual text, 2K resolution    |

**Supported model families**: SD 1.x/2.x, SDXL (Illustrious/NoobAI/Pony), SD3, FLUX, Krea 2, Ideogram 4, Qwen Image, Chroma, Wan (video), LTX-2 (video+audio)

**Reference implementations**: `../stable-diffusion.cpp/` (upstream repo) and `../sd.cpp-webui/` (web UI wrapper with API integration patterns)

## Architecture

loop-lore's generation module (assets/service.ts + generation/ image pipeline) sends requests to both OpenAI API and sd-server/WebUI/Native APIs. The architecture supports two backends in parallel: OpenAI `/v1/images/generations` for remote generation and sd-server's local endpoints (`/sdapi/v1/txt2img`, `/sdcpp/v1/img_gen`).

Three integration paths:

| API        | Endpoint                      | Best For                                                |
| ---------- | ----------------------------- | ------------------------------------------------------- |
| **OpenAI** | `POST /v1/images/generations` | Simple text-to-image, drop-in OpenAI client replacement |
| **OpenAI** | `POST /v1/images/edits`       | Image-to-image / inpainting from multipart form data    |
| **WebUI**  | `POST /sdapi/v1/txt2img`      | Full param control (sampler, scheduler, CFG, LoRA)      |
| **WebUI**  | `POST /sdapi/v1/img2img`      | Full param control for image-to-image                   |
| **sdcpp**  | `POST /sdcpp/v1/img_gen`      | Async generation with job polling and queue management  |

## Building sd-server

```bash
cd ../stable-diffusion.cpp

# CPU + Vulkan (used locally, per ../sd.cpp-webui/)
cmake -B build-vk -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON -DSD_CUBLAS=OFF
cmake --build build-vk --config Release -j --target sd-server

# CPU only
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j --target sd-server

# CUDA
cmake -B build-cuda -DCMAKE_BUILD_TYPE=Release -DSD_CUBLAS=ON
cmake --build build-cuda --config Release -j --target sd-server
```

The `sd.cpp-webui` project symlinks the built binary:

```bash
# sd.cpp-webui/ already has these symlinks:
#   sd-server -> ../stable-diffusion.cpp/build-vk/bin/sd-server
#   sd-cli    -> ../stable-diffusion.cpp/build-vk/bin/sd-cli
```

## Starting the Server

Minimal:

```bash
../stable-diffusion.cpp/build-vk/bin/sd-server \
  --model /path/to/model.gguf \
  --port 9000
```

With full control (from sd.cpp-webui defaults):

```bash
../stable-diffusion.cpp/build-vk/bin/sd-server \
  --model /path/to/model.gguf \
  --port 9000 \
  --threads 8 \
  --wtype default \
  --rng cuda \
  --diffusion-fp16
```

### Key CLI Flags

| Flag                    | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `--model, -m`           | Path to diffusion model GGUF file                               |
| `--port`                | HTTP port (default: 8080)                                       |
| `--host`                | Bind address (default: 127.0.0.1)                               |
| `--threads, -t`         | Number of CPU threads                                           |
| `--wtype`               | Weight type (default, f32, f16, q4_0, q4_1, q5_0, q5_1, q8_0)   |
| `--rng`                 | RNG type (std_default, cuda)                                    |
| `--diffusion-fp16`      | Run diffusion in fp16 mode                                      |
| `--vae-fp16`            | Run VAE in fp16 mode                                            |
| `--control-net-path`    | Path to ControlNet models                                       |
| `--lora-model-dir`      | Directory for LoRA models                                       |
| `--embd-dir`            | Directory for textual inversion embeddings                      |
| `--taesd-path`          | Path to TAESD model for fast latent decoding                    |
| `--esrgan-path`         | Path to ESRGAN upscaler model                                   |
| `--hires-upscalers-dir` | Directory for hires fix upscaler models                         |
| `--output-dir`          | Output directory for generated images                           |
| `--init-image`          | Init image for img2img mode                                     |
| `--mask-image`          | Mask image for inpainting                                       |
| `--strength`            | Denoising strength (0.0–1.0) for img2img                        |
| `--cfg-scale`           | CFG scale (guidance strength)                                   |
| `--sample-method`       | Sampler (euler_a, euler, heun, dpm2, lcm, ddim, dpm++ 2m, etc.) |
| `--scheduler`           | Scheduler type                                                  |
| `--steps`               | Number of sampling steps                                        |
| `--seed`                | Random seed (-1 = random)                                       |
| `--batch-count`         | Number of images to generate                                    |
| `--clip-skip`           | CLIP skip layers                                                |

## API Families

### 1. OpenAI API (`/v1/...`)

Drop-in replacement for OpenAI's image generation API. Best for simple integration where loop-lore already has an OpenAI client.

#### `POST /v1/images/generations`

Takes standard OpenAI request fields:

| Field                | Type      | Required | Default | Notes                                      |
| -------------------- | --------- | -------- | ------- | ------------------------------------------ |
| `prompt`             | `string`  | Yes      | —       | Text prompt for generation                 |
| `n`                  | `integer` | No       | 1       | Number of images to generate               |
| `size`               | `string`  | No       | default | Format `WIDTHxHEIGHT` (e.g. `"1024x1024"`) |
| `output_format`      | `string`  | No       | `"png"` | `"png"`, `"jpeg"`, or `"webp"`             |
| `output_compression` | `integer` | No       | 100     | Compression level (0–100)                  |

**Response**:

```json
{
  "created": 1775401200,
  "output_format": "png",
  "data": [{ "b64_json": "iVBORw0KGgo..." }]
}
```

#### `POST /v1/images/edits`

Image-to-image / inpainting via multipart form data:

| Field           | Type      | Required | Notes                                   |
| --------------- | --------- | -------- | --------------------------------------- |
| `prompt`        | `string`  | Yes      | Text prompt                             |
| `image[]`       | `file[]`  | One of   | Preferred image upload field (multiple) |
| `image`         | `file`    | One of   | Legacy single-image upload              |
| `mask`          | `file`    | No       | Optional mask for inpainting            |
| `n`             | `integer` | No       | Number of images                        |
| `size`          | `string`  | No       | `WIDTHxHEIGHT` format                   |
| `output_format` | `string`  | No       | `"png"` or `"jpeg"`                     |

#### `GET /v1/models`

Returns the loaded model (always `"sd-cpp-local"`).

#### Native Extension via `sd_cpp_extra_args`

Both OpenAI endpoints support embedding native sdcpp parameters inside the prompt:

```
a cosmic landscape <sd_cpp_extra_args>{"sample_params":{"sample_steps":28,"cfg_scale":7.5}}</sd_cpp_extra_args>
```

The JSON block is extracted and applied to generation parameters, then stripped from the prompt before generation.

---

### 2. Stable Diffusion WebUI API (`/sdapi/v1/...`)

Compatible with AUTOMATIC1111's API format. Provides full parameter control — sampler, scheduler, CFG scale, LoRA, hires fix, and more.

#### `POST /sdapi/v1/txt2img`

| Field                | Type            | Default        | Notes                                                                 |
| -------------------- | --------------- | -------------- | --------------------------------------------------------------------- |
| `prompt`             | `string`        | —              | Required                                                              |
| `negative_prompt`    | `string`        | `""`           | Negative prompt                                                       |
| `width`              | `integer`       | 512            | Image width                                                           |
| `height`             | `integer`       | 512            | Image height                                                          |
| `steps`              | `integer`       | server default | Sampling steps                                                        |
| `cfg_scale`          | `number`        | server default | CFG / text guidance scale                                             |
| `seed`               | `integer`       | -1             | -1 = random                                                           |
| `batch_size`         | `integer`       | 1              | Number of images                                                      |
| `clip_skip`          | `integer`       | —              | CLIP skip (optional)                                                  |
| `sampler_name`       | `string`        | —              | `"euler_a"`, `"euler"`, `"dpm++ 2m"`, `"lcm"`, etc.                   |
| `scheduler`          | `string`        | —              | Scheduler type                                                        |
| `lora`               | `array[object]` | —              | Structured LoRA list: `[{"path": "...", "multiplier": 0.8}]`          |
| `enable_hr`          | `boolean`       | false          | Enable hires fix                                                      |
| `hr_scale`           | `number`        | —              | Hires upscale scale                                                   |
| `hr_resize_x`        | `integer`       | —              | Hires target width                                                    |
| `hr_resize_y`        | `integer`       | —              | Hires target height                                                   |
| `hr_steps`           | `integer`       | —              | Hires second-pass steps                                               |
| `hr_upscaler`        | `string`        | —              | Upscaler name (`"Lanczos"`, `"Nearest"`, latent modes, or model name) |
| `denoising_strength` | `number`        | —              | Hires denoising strength (txt2img)                                    |

**Response**:

```json
{
  "images": ["base64png..."],
  "parameters": { ... },
  "info": ""
}
```

#### `POST /sdapi/v1/img2img`

Same fields as txt2img, plus:

| Field                    | Type               | Notes                                     |
| ------------------------ | ------------------ | ----------------------------------------- |
| `init_images`            | `array[string]`    | Base64 or data URL input images           |
| `mask`                   | `string`           | Base64 or data URL mask (optional)        |
| `inpainting_mask_invert` | `integer\|boolean` | Invert mask flag                          |
| `denoising_strength`     | `number`           | Image-to-image strength (clamped 0.0–1.0) |

#### Discovery Endpoints

| Method | Endpoint                         | Purpose                                            |
| ------ | -------------------------------- | -------------------------------------------------- |
| `GET`  | `/sdapi/v1/loras`                | List available LoRA models                         |
| `GET`  | `/sdapi/v1/upscalers`            | List available upscalers (built-in + model-backed) |
| `GET`  | `/sdapi/v1/latent-upscale-modes` | List latent upscale modes                          |
| `GET`  | `/sdapi/v1/samplers`             | List available samplers                            |
| `GET`  | `/sdapi/v1/schedulers`           | List available schedulers                          |
| `GET`  | `/sdapi/v1/sd-models`            | Show loaded model metadata                         |
| `GET`  | `/sdapi/v1/options`              | Show server options (output format, model)         |

---

### 3. Native sdcpp API (`/sdcpp/v1/...`)

The full-power async API with job queues, progress tracking, and cancellation.

#### Job Lifecycle

All generation requests create a job. Pollable via `GET /sdcpp/v1/jobs/{id}`.

```
queued → generating → completed
                   → failed
                   → cancelled
```

**Job shape:**

```json
{
  "id": "job_01HTXYZABC",
  "kind": "img_gen",
  "status": "queued",
  "created": 1775401200,
  "started": null,
  "completed": null,
  "queue_position": 2,
  "result": null,
  "error": null
}
```

#### `POST /sdcpp/v1/img_gen`

Submit an image generation job with full native control:

```json
{
  "prompt": "a cosmic landscape",
  "negative_prompt": "blurry, low quality",
  "width": 1024,
  "height": 1024,
  "seed": -1,
  "batch_count": 1,
  "sample_params": {
    "sample_steps": 28,
    "sample_method": "euler_a",
    "scheduler": "karras",
    "guidance": {
      "txt_cfg": 7.5,
      "img_cfg": null,
      "distilled_guidance": 0.0
    }
  },
  "lora_map": {},
  "high_noise_lora_map": {},
  "control_net": null,
  "hires": {
    "enabled": false,
    "scale": 2.0,
    "steps": 20,
    "upscaler": "Lanczos",
    "denoising_strength": 0.7
  },
  "init_image": null,
  "mask_image": null,
  "clip_skip": -1,
  "output_format": "png"
}
```

**Response** (202 Accepted):

```json
{
  "id": "job_01HTXYZABC",
  "kind": "img_gen",
  "status": "queued",
  "queue_position": 2
}
```

#### `GET /sdcpp/v1/jobs/{id}`

Poll for job status. On completion, `result` contains the generated images as base64.

#### `POST /sdcpp/v1/jobs/{id}/cancel`

Cancel a queued or generating job.

#### `GET /sdcpp/v1/capabilities`

Discover server capabilities — supported modes, defaults by mode, samplers, schedulers, LoRAs, upscalers, and limits:

```json
{
  "model": {
    "name": "provider/model-name",
    "stem": "flux2-klein",
    "path": "/path/to/model.gguf"
  },
  "current_mode": "img_gen",
  "supported_modes": ["img_gen", "vid_gen"],
  "defaults_by_mode": {
    "img_gen": { "width": 1024, "height": 1024, ... },
    "vid_gen": { ... }
  },
  "samplers": ["euler_a", "euler", "dpm++ 2m", ...],
  "schedulers": ["default", "karras", "exponential", ...],
  "loras": [{"name": "style.safetensors", "path": "style.safetensors"}],
  "limits": {
    "min_width": 256, "max_width": 2048,
    "min_height": 256, "max_height": 2048,
    "max_batch_count": 8,
    "max_queue_size": 16
  }
}
```

---

## Integration Decision

| Use Case                               | Recommended API                                                | Reason                                        |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Simple text-to-image from chat         | OpenAI API (`/v1/images/generations`)                          | Drop-in OpenAI compatibility, minimal code    |
| Full param control in image pipeline   | WebUI API (`/sdapi/v1/txt2img`)                                | Sampler, scheduler, CFG, LoRA, hires fix      |
| Background generation with UI feedback | sdcpp API (`/sdcpp/v1/img_gen`)                                | Async job polling, queue management, progress |
| Capability discovery                   | sdcpp API (`/sdcpp/v1/capabilities`)                           | Model info, samplers, limits in one call      |
| Image-to-image / inpainting            | OpenAI API (`/v1/images/edits`) or WebUI (`/sdapi/v1/img2img`) | Both support it; WebUI has more control       |
| LoRA management                        | WebUI API (`/sdapi/v1/loras`)                                  | Structured LoRA list with names and paths     |

**MVP recommendation**: Use the **OpenAI API** (`/v1/images/generations`) as the primary integration target — it requires minimal new code since it shares shape with the existing OpenAI-compatible generation flow. For advanced features (LoRA, hires, sampler selection), fall back to the **WebUI API**.

---

## Error Handling & Retry

sd-server errors vary by API family. The provider must handle:

| HTTP Code | Meaning                      | Action                                     |
| --------- | ---------------------------- | ------------------------------------------ |
| 200       | Success                      | Process response                           |
| 202       | Job accepted (sdcpp API)     | Begin polling for completion               |
| 400       | Bad request (invalid params) | Fail immediately, surface to user          |
| 404       | Model not loaded             | Fail with "model not available"            |
| 429       | Queue full                   | Retry with backoff, surface queue position |
| 500       | Server error                 | Retry up to `retries` times                |
| 503       | Server loading model         | Retry with backoff (model warm-up)         |
| Timeout   | No response within timeout   | Abort, surface timeout error               |

**Retry strategy**: Exponential backoff with jitter. First retry at `retryBackoffMs`, second at `2 × retryBackoffMs`. Do not retry on 400 (bad request).

**Generation timeout**: Image generation is slower than text. Use `generationTimeout` (default 5 min) separate from connection `timeout`. For sdcpp async API, the timeout applies to total polling duration.

### Health Check

```typescript
async function healthCheck(config: ImageGenerationConfig): Promise<{
  status: "ok" | "degraded" | "down";
  model?: string;
  apiFamily?: string;
  latencyMs?: number;
  error?: string;
}>;
```

Implementation:

1. `GET /v1/models` (OpenAI) or `GET /sdcpp/v1/capabilities` (sdcpp) with `timeout` ms limit
2. If response valid → `status: "ok"`, include model info
3. If response is slow (>10s) → `status: "degraded"` (large model loading)
4. If timeout or connection refused → `status: "down"`

### Progress Tracking

For synchronous APIs (OpenAI, WebUI), progress is binary: waiting → done.

For async sdcpp API, the provider tracks job progress:

```typescript
interface JobProgress {
  jobId: string;
  status: "queued" | "generating" | "completed" | "failed" | "cancelled";
  queuePosition?: number;
  estimatedMs?: number; // estimated time remaining
  result?: { images: string[] }; // base64 images on completion
  error?: string;
}
```

Polling strategy:

1. Submit job → receive `jobId`
2. Poll `GET /sdcpp/v1/jobs/{id}` every `pollIntervalMs`
3. Update progress: `queuePosition` → `generating` → `completed`
4. Stop polling on `completed`, `failed`, or `cancelled`
5. Timeout after `maxPollAttempts` polls

### Cancellation

For sdcpp async jobs:

```typescript
async function cancelJob(config: ImageGenerationConfig, jobId: string): Promise<boolean>;
```

- `POST /sdcpp/v1/jobs/{id}/cancel`
- Returns `true` if cancellation accepted
- On cancellation, clean up partial assets if any

For OpenAI/WebUI synchronous requests:

- Abort the HTTP request via `AbortController`
- No server-side cancellation (server completes generation, result discarded)

### Image Generation Presets

Image generation parameters can be configured per-chat based on the task type. Presets bundle CFG scale, steps, sampler, and resolution into named profiles.

**Type definition** (add to `src/generation/gen-types-options.ts`):

```typescript
/** Named preset for image generation parameters */
interface ImageGenerationPreset {
  name: string;
  description: string;
  params: {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    sampler?: string;
    scheduler?: string;
    clipSkip?: number;
    batchCount?: number;
  };
}
```

**Built-in presets**:

| Preset     | Steps | CFG | Resolution | Sampler    | Use Case                     |
| ---------- | ----- | --- | ---------- | ---------- | ---------------------------- |
| `fast`     | 15    | 5.0 | 512×512    | `lcm`      | Quick drafts, iteration      |
| `balanced` | 25    | 7.0 | 1024×1024  | `euler_a`  | General purpose              |
| `quality`  | 40    | 8.0 | 1024×1024  | `dpm++ 2m` | High-quality final output    |
| `detailed` | 50    | 9.0 | 1536×1536  | `euler`    | Maximum detail, large images |
| `anime`    | 30    | 7.5 | 1024×1024  | `euler_a`  | Anime/illustration style     |
| `photo`    | 35    | 7.0 | 1024×1024  | `dpm++ 2m` | Photorealistic output        |

**Preset resolution** (same as text presets):

1. Chat-level preset (stored in `chats.settings` JSON)
2. Global default (`balanced`)

**Chat settings JSON schema** (extends text preset schema):

```typescript
// chats.settings (JSON string)
interface ChatSettings {
  generationPreset?: string; // text preset name
  imageGenerationPreset?: string; // image preset name
  // ... other chat settings
}
```

**Per-message override**: User can override the preset for a single image generation via the input area UI.

**API parameter mapping**:

| Preset param | WebUI API field | sdcpp API field                  | Notes            |
| ------------ | --------------- | -------------------------------- | ---------------- |
| `width`      | `width`         | `width`                          | Image width      |
| `height`     | `height`        | `height`                         | Image height     |
| `steps`      | `steps`         | `sample_params.sample_steps`     | Sampling steps   |
| `cfgScale`   | `cfg_scale`     | `sample_params.guidance.txt_cfg` | Guidance scale   |
| `sampler`    | `sampler_name`  | `sample_params.sample_method`    | Sampling method  |
| `scheduler`  | `scheduler`     | `sample_params.scheduler`        | Scheduler type   |
| `clipSkip`   | `clip_skip`     | `clip_skip`                      | CLIP skip layers |
| `batchCount` | `batch_size`    | `batch_count`                    | Number of images |

---

## Integration with loop-lore

### Connection Points

The generation module's multi-step pipeline (`step-pipeline.ts`) already supports steps beyond text generation:

```typescript
// example steps in a multi-modal generation:
// ["generate_text", "generate_image", "caption", "attach_asset"]
```

The image generation step would:

1. Call `sd-server` via one of the three APIs
2. For sdcpp API: submit job, poll with `cancellation-manager.ts` tracking
3. Receive base64-encoded image bytes
4. Save through the assets system (`src/assets/`) as a new asset
5. Link the asset to the message via `asset_links` (polymorphic FK)
6. Return an asset reference in the generation result

**Cancellation integration**: The `cancellation-manager.ts` tracks active image generations. When a user cancels:

- For sdcpp async: call `POST /sdcpp/v1/jobs/{id}/cancel`, mark attempt as `cancelled`
- For OpenAI/WebUI sync: abort HTTP request via `AbortController`

**Step pipeline integration**: Use `completeStep()` and `failStep()` from `step-pipeline.ts` to track image generation progress in multi-step pipelines. The `GenerationStep.name` for image generation is `"generate_image"`.

### Asset Pipeline

Images generated by sd-server flow through loop-lore's existing asset system: sd-server returns a base64 image, which flows into `assets/service.ts`, gets linked via `asset_links` to the message, and is stored on disk at `data/assets/raw/...`.

The assets system (see [`docs/assets.md`](./assets.md)) handles:

- Storage to `data/assets/raw/` with UUID-derived paths
- Optional compression variants (WebP thumbnails)
- Polymorphic linking to any entity (message, character, world)

### Configuration

```typescript
// src/generation/providers/image-generation.ts
interface ImageGenerationConfig {
  /** Base URL of sd-server (e.g. http://localhost:9000) */
  baseUrl: string;
  /** API family to use: "openai" | "sdapi" | "sdcpp" */
  apiFamily: "openai" | "sdapi" | "sdcpp";
  /** Default generation parameters */
  defaults: {
    width: number;
    height: number;
    steps: number;
    cfg_scale: number;
    sampler: string;
    batch_size: number;
  };
  /** Connection timeout in ms (default: 30_000) */
  timeout: number;
  /** Generation timeout in ms (default: 300_000 — 5 min for large images) */
  generationTimeout: number;
  /** Max retry attempts for transient failures (default: 2) */
  retries: number;
  /** Retry backoff base in ms (default: 2_000, exponential) */
  retryBackoffMs: number;
  /** Request headers (e.g. Authorization for remote servers) */
  headers?: Record<string, string>;
  /** Polling interval for async job status (default: 2_000 ms) */
  pollIntervalMs: number;
  /** Max polling attempts before timeout (default: 150 = 5 min @ 2s) */
  maxPollAttempts: number;
}
```

Env vars:

| Variable                   | Default                 | Purpose                  |
| -------------------------- | ----------------------- | ------------------------ |
| `SDCPP_BASE_URL`           | `http://localhost:9000` | sd-server endpoint       |
| `SDCPP_API_FAMILY`         | `openai`                | API family to use        |
| `SDCPP_DEFAULT_WIDTH`      | `1024`                  | Default image width      |
| `SDCPP_DEFAULT_HEIGHT`     | `1024`                  | Default image height     |
| `SDCPP_DEFAULT_STEPS`      | `28`                    | Default sampling steps   |
| `SDCPP_DEFAULT_CFG`        | `7.5`                   | Default CFG scale        |
| `SDCPP_TIMEOUT`            | `30000`                 | Connection timeout in ms |
| `SDCPP_GENERATION_TIMEOUT` | `300000`                | Generation timeout in ms |
| `SDCPP_RETRIES`            | `2`                     | Max retry attempts       |

### Streamlined Integration (OpenAI API Path)

Since the generation module already has OpenAI-compatible client code, the simplest integration path is:

1. Create a thin sd.cpp provider that wraps the existing HTTP client
2. For text-to-image: `POST /v1/images/generations` with `{ prompt, n, size }`
3. Parse the `data[].b64_json` response
4. Pass to `assets/service.ts` for storage + linking

### Using the sdcpp API for Background Jobs

For asynchronous image generation (e.g. from the web UI where the user can cancel mid-generation):

1. `POST /sdcpp/v1/img_gen` → receives job ID
2. Poll `GET /sdcpp/v1/jobs/{id}` with exponential backoff
3. On completion, process image and link to message
4. Allow cancellation via `POST /sdcpp/v1/jobs/{id}/cancel`

---

## Supported Model Families

stable-diffusion.cpp supports a wide range of architectures. See each model's documentation in `../stable-diffusion.cpp/docs/`:

| Model Family                               | Doc                                                         | Type  | Notes                                        |
| ------------------------------------------ | ----------------------------------------------------------- | ----- | -------------------------------------------- |
| SD 1.x / 2.x                               | [sd.md](../stable-diffusion.cpp/docs/sd.md)                 | Image | Legacy, widely compatible                    |
| SDXL / SDXL-Turbo                          | [sd.md](../stable-diffusion.cpp/docs/sd.md)                 | Image | Higher quality, more VRAM                    |
| SDXL fine-tunes: Illustrious, NoobAI, Pony | —                                                           | Image | Anime/illustration, booru-style tags         |
| SD3 / SD3.5                                | [sd3.md](../stable-diffusion.cpp/docs/sd3.md)               | Image | Latest Stability models                      |
| FLUX.1-dev/schnell                         | [flux.md](../stable-diffusion.cpp/docs/flux.md)             | Image | Fast, high-quality                           |
| FLUX.2-dev/klein                           | [flux2.md](../stable-diffusion.cpp/docs/flux2.md)           | Image | Latest FLUX generation                       |
| Krea 2                                     | [krea2.md](../stable-diffusion.cpp/docs/krea2.md)           | Image | Foundation model, style transfer, moodboards |
| Ideogram 4                                 | —                                                           | Image | JSON caption prompting, text rendering       |
| Qwen Image 2.0                             | [qwen_image.md](../stable-diffusion.cpp/docs/qwen_image.md) | Image | Native 2K, multilingual text, editing        |
| Chroma / Chroma1 Radiance                  | [chroma.md](../stable-diffusion.cpp/docs/chroma.md)         | Image | Fast transformer-based                       |
| HiDream-O1, Lens                           | docs above                                                  | Image | Various modern architectures                 |
| Wan 2.1 / 2.2                              | [wan.md](../stable-diffusion.cpp/docs/wan.md)               | Video | Text/image-to-video, audio                   |
| LTX-2.3                                    | [ltx2.md](../stable-diffusion.cpp/docs/ltx2.md)             | Video | Audio-video, 4K, 50fps, image-to-video       |

Models typically need to be in GGUF format (quantized). The VAE (autoencoder) model can be embedded in the main GGUF or loaded separately.

### Video Generation

Video models (Wan, LTX-2) generate video sequences. Key differences from image generation:

- **Input**: Text-to-video OR image-to-video (image acts as first frame / style reference)
- **Output**: Video file (MP4/WebM) or frame sequence
- **Duration**: Configurable (LTX-2 up to 20s at 4K/50fps)
- **Audio**: LTX-2 generates synchronized audio alongside video
- **Prompting**: Include motion/action descriptions ("a cat jumping", "camera panning left")

**Image-to-video pipeline**: When generating video from an image, the image is uploaded first, then passed as `init_image` to the video generation endpoint. This is a two-step process: upload → generate.

### Model-Specific Prompting

Different model families require different prompting approaches. The provider must handle prompt adaptation based on the active model:

| Model Family                              | Prompt Style                             | Token Limit | Key Differences                            |
| ----------------------------------------- | ---------------------------------------- | ----------- | ------------------------------------------ |
| SD 1.x / 2.x                              | Natural language, comma-separated tags   | <75         | CLIP tokenizer, legacy style               |
| SDXL                                      | Natural language, descriptive paragraphs | 77-150      | Better with detailed prompts               |
| SDXL fine-tunes (Illustrious/NoobAI/Pony) | Booru-style tags + natural language      | 77-150      | Danbooru/E621 tag vocabulary               |
| SD3 / SD3.5                               | Natural language, T5 tokenizer           | 100-300     | Longer context, detailed descriptions      |
| FLUX.1 / FLUX.2                           | Natural language, very flexible          | 100-300     | Best with detailed natural descriptions    |
| Krea 2                                    | Natural language + creativity slider     | 100-300     | `creativity` param controls interpretation |
| Ideogram 4                                | **JSON captions required**               | 100-300     | Structured `compositional_deconstruction`  |
| Qwen Image 2.0                            | Natural language, multilingual           | 100-300     | Native 2K, text rendering up to 1K tokens  |
| Chroma                                    | Natural language, transformer-based      | 100-300     | Similar to FLUX                            |
| Wan (video)                               | Natural language + motion descriptions   | 100-300     | Include motion/action for video            |
| LTX-2 (video)                             | Natural language + motion descriptions   | 100-300     | Image-to-video, synchronized audio         |

**SDXL fine-tunes (Illustrious, NoobAI, Pony)**:

These are SDXL checkpoints fine-tuned on anime/illustration datasets with booru-style tag vocabularies:

- **Illustrious**: Trained on Danbooru tags. Use tag-style prompting (`1girl, black hair, blue eyes, smile`). CFG 3-6 (higher overbakes). No score tags.
- **NoobAI**: Trained on Danbooru + E621. Similar to Illustrious but broader vocabulary.
- **Pony**: Uses score tags (`score_9, score_8_up`). Higher CFG needed (6-8+). Different tag conventions.
- **Hybrid approach**: Combine booru tags with natural language for best results. Tags control specifics; natural language fills gaps.

Example Illustrious prompt:

```
masterpiece, best quality, solo, 1girl, upper body, black hair, short hair, ahoge, blue eyes, smile, looking at viewer, open mouth, black top, outdoors, highres, (depth of field), bokeh, diffused light
```

**Krea 2**:

Krea 2 is a foundation model with unique controls beyond standard prompting:

- `creativity` parameter: `raw` (literal) → `low` → `medium` (default) → `high` (interpretive)
- **Style transfer**: Upload reference images, extract and apply their style
- **Moodboards**: Pass multiple images for concept/mood extraction (uses LLMs + clustering)
- **Generative sliders**: `intensity`, `complexity`, `movement` (-100 to 100)
- Short/vague prompts + high creativity = model fills in style, composition, color palette

**Ideogram 4**:

Ideogram 4 requires **structured JSON captions**, not plain text:

```json
{
  "high_level_description": "A bold typographic poster",
  "style_description": { "style": "modern minimalist" },
  "compositional_deconstruction": {
    "foreground": ["large text reading 'HELLO'"],
    "background": ["solid color gradient"],
    "lighting": "studio"
  }
}
```

Plain text prompts should be expanded via "magic prompt" (LLM-based expansion) before sending. The `POST /v1/ideogram-v4/generate` endpoint accepts `text_prompt` which triggers magic prompt expansion server-side.

**Qwen Image 2.0**:

- Native 2K resolution generation
- Ultra-long text rendering (up to 1K tokens in prompts)
- Multilingual text rendering across diverse languages
- Combined generation + editing in single model
- Best with detailed, compositional descriptions

**Prompt length guidelines**:

- SD 1.x/2.x: Keep under 75 tokens (CLIP limit). Use commas for tags.
- SDXL / Illustrious / NoobAI / Pony: 77-150 tokens. Mix booru tags + natural language.
- SD3/FLUX/Krea 2/Qwen: 100-300 tokens. Detailed natural language descriptions.
- Ideogram 4: Use JSON caption format; magic prompt expands short input.
- Video models (Wan/LTX-2): 100-300 tokens. Include motion/action descriptions.
- For all models: Negative prompts help steer output away from unwanted artifacts.

**Prompt engineering per model type**:

- **Photorealistic**: "highly detailed, sharp focus, professional photography, 8k"
- **Anime**: "anime style, detailed, vibrant colors, cel shading" + booru tags for Illustrious/NoobAI/Pony
- **Artistic**: "oil painting, masterpiece, best quality, detailed brushstrokes"
- **Text-heavy**: Use Ideogram 4 or Qwen Image for best text rendering
- **Video**: "a [subject] [action], camera [movement], [scene description]"
- **Negative prompt baseline**: "blurry, low quality, watermark, text, deformed"

### LLM Prompt Templates for Image Generation

When the user triggers image generation from chat (wand menu, slash command, interactive mode), the LLM is called to convert chat context into an image prompt. Different image models need different prompt formats.

The prompt template system at `src/generation/prompt-templates.ts` provides:

- **Model profiles**: Pre-configured profiles for SD1, SD2, SDXL, Illustrious, Noob, Pony, SD3, FLUX, Krea 2, Anima, Ideogram 4, Qwen Image, Chroma
- **Prompt format**: Whether the model expects tags, natural language, mixed, or JSON
- **Detail levels**: Per-model templates for `instant`, `balanced`, and `detailed` modes
- **Gen mode templates**: Separate templates for `yourself`, `face`, `me`, `scene`, `last`, `background`
- **Auto-matching**: Resolve profile by model name string (e.g. "flux1-dev" → FLUX profile)

**Template resolution flow**:

1. User triggers image gen (e.g. `/sd you` for a character portrait)
2. System resolves the image model profile by model name or explicit profile ID
3. Selects the correct template for the gen mode + detail level
4. Fills template tokens (`{{charName}}`, `{{charDescription}}`, `{{lastMessage}}`, etc.) from chat context
5. Sends the resolved prompt to the LLM, which generates the SD prompt
6. The SD prompt is sent to the image generation backend

**Key templates by model family**:

| Family | Format | Template pattern | Example use |
|--------|--------|-----------------|-------------|
| SD1/SD2/tags | `tags` | "Ignore previous instructions. Write comma-separated image tags..." | Legacy models, CLIP 75 token limit |
| SDXL | `tags` | "Ignore previous instructions. Write comma-separated image tags..." | Higher quality, 150 token limit |
| Illustrious/Noob | `tags` | "Ignore previous instructions. Write comma-separated booru-style tags..." | Danbooru tag vocabulary, CFG 3-6 |
| Pony | `tags` | "Ignore previous instructions. Write comma-separated tags with score prefix..." | Score tags required, CFG 6-8+ |
| SD3/FLUX | `natural` | "Describe {{charName}} in detailed natural language..." | Long descriptions, T5 tokenizer |
| Krea 2 | `natural` | "Describe {{charName}} in one flowing paragraph..." | Natural language, low step count |
| Anima | `tags-and-natural` | "Describe {{charName}} using lowercase keywords with spaces..." | Mix of tags and natural language |
| Ideogram 4 | `json` | "Output JSON: {"high_level_description": "{{charName}}", ...}" | JSON caption format required |
| Qwen/Chroma | `natural` | "Describe {{charName}} in detailed natural language..." | Long context, multilingual |

**Template token variables**:

| Token | Source | Description |
|-------|--------|-------------|
| `{{charName}}` | Character card | Name of the AI character |
| `{{charDescription}}` | Character card | Character appearance/description |
| `{{userName}}` | User persona | Name of the user persona |
| `{{userDescription}}` | User persona | User persona description |
| `{{lastMessage}}` | Chat history | Last message text |
| `{{sceneSummary}}` | Scene context | Summary of current scene |
| `{{chatHistory}}` | Chat history | Recent chat history |
| `{{negativePrompt}}` | Config | User-configured negative prompt |
| `{{charPrefix}}` | Character card | Character-specific prompt prefix |

**Detail level impact on token budget**:

| Detail level | Template tokens | Context tokens | Total | Use case |
|-------------|----------------|---------------|-------|----------|
| `instant` | ~60-80 | ~100-200 | ~160-280 | Fast generation, quick drafts |
| `balanced` | ~120-180 | ~200-400 | ~320-580 | General purpose |
| `detailed` | ~200-300 | ~400-800 | ~600-1100 | High-quality final output |

**Note on the "ignore previous instructions" pattern**: This is intentional. The LLM must switch from RPG chat mode (roleplaying as a character) to image description mode (generating a structured prompt for the image model). The pattern is only used for tag-based models where the format change is most dramatic. Natural language models (FLUX, Krea2, SD3) use a softer transition since the format is closer to the chat style.

**Cross-reference**: Implementation in `src/generation/prompt-templates.ts`, tests in `src/generation/prompt-templates.test.ts`.

### LoRA Integration

LoRA (Low-Rank Adaptation) models modify generation style. stable-diffusion.cpp supports LoRAs via multiple methods:

**Method 1: In-prompt injection (sd_cpp_extra_args)**

The OpenAI API supports embedding native parameters inside the prompt using XML-like tags:

```
a cosmic landscape <sd_cpp_extra_args>{"sample_params":{"sample_steps":28,"cfg_scale":7.5},"lora_map":{"style_lora":0.8}}</sd_cpp_extra_args>
```

The JSON block is extracted, applied to generation parameters, then stripped from the prompt before generation. This allows LoRA activation without separate API calls.

**Method 2: WebUI API (structured LoRA list)**

```json
{
  "prompt": "a cosmic landscape",
  "lora": [{ "path": "path/to/lora.safetensors", "multiplier": 0.8 }]
}
```

**Method 3: sdcpp API (lora_map)**

```json
{
  "prompt": "a cosmic landscape",
  "lora_map": {
    "path/to/lora.safetensors": 0.8
  }
}
```

**LoRA discovery**: `GET /sdapi/v1/loras` returns available LoRAs. For sdcpp: `GET /sdcpp/v1/capabilities` includes `loras` array.

**Loop-lore integration**:

- Store LoRA preferences in `chats.settings` or `actors.settings` JSON
- Apply LoRAs based on character style or chat context
- Present LoRA selector in UI when multiple LoRAs are available

---

## ComfyUI Integration (Future)

[ComfyUI](https://github.com/comfyanonymous/ComfyUI) is a node-based workflow editor for diffusion models. It provides a powerful API for programmatic workflow execution — useful for complex multi-step generation pipelines (img2img + ControlNet + upscaling, video generation, etc.).

**Status**: Not MVP. Documented for future integration when advanced pipeline support is needed.

### Why ComfyUI

| Capability               | Benefit                                                 |
| ------------------------ | ------------------------------------------------------- |
| **Node-based workflows** | Compose complex generation pipelines visually           |
| **All model types**      | SD, SDXL, FLUX, Wan, LTX, video, inpainting, ControlNet |
| **WebSocket progress**   | Real-time execution status per node                     |
| **Workflow templates**   | Save/reuse/share generation pipelines                   |
| **Custom nodes**         | Extensible via community node ecosystem                 |
| **Image upload**         | Input images for img2img, ControlNet, video generation  |

### API Overview

ComfyUI runs on port 8188 by default. Key endpoints:

| Endpoint               | Method    | Purpose                                 |
| ---------------------- | --------- | --------------------------------------- |
| `/prompt`              | POST      | Submit workflow for execution           |
| `/prompt`              | GET       | Get queue status                        |
| `/queue`               | GET       | Detailed queue view (running + pending) |
| `/queue`               | POST      | Delete items from queue or clear        |
| `/interrupt`           | POST      | Cancel currently executing workflow     |
| `/history/{prompt_id}` | GET       | Results for a specific prompt           |
| `/history`             | GET       | Full execution history                  |
| `/upload/image`        | POST      | Upload image to input directory         |
| `/view`                | GET       | Retrieve generated image by filename    |
| `/object_info`         | GET       | Full node catalogue                     |
| `/system_stats`        | GET       | Server info: Python, CUDA, VRAM         |
| `/embeddings`          | GET       | List installed text embeddings          |
| `/models/{type}`       | GET       | List available models of a type         |
| `/free`                | POST      | Free VRAM, unload models                |
| `/ws`                  | WebSocket | Real-time execution events              |

### Workflow Execution Flow

```
1. Build workflow JSON (API format)
2. POST /prompt → receive prompt_id
3. Listen on /ws for execution progress
4. GET /history/{prompt_id} → retrieve results
5. GET /view?filename={output} → download image
```

### Workflow JSON Format

Workflows are submitted as JSON graphs where each node has inputs connected to other nodes' outputs:

```json
{
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 42,
      "steps": 20,
      "cfg": 7.0,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1.0,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    }
  },
  "4": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "model.safetensors" }
  }
}
```

### loop-lore Integration Notes

- **When to use**: Complex multi-step pipelines (ControlNet + img2img + upscaling), video generation workflows, community node ecosystem
- **When NOT to use**: Simple text-to-image (sd-server OpenAI API is simpler)
- **Provider pattern**: Create `src/generation/providers/comfyui.ts` that submits workflow JSON and polls for results
- **Workflow storage**: Store workflow templates in `data/workflows/` or as assets
- **Progress**: Use WebSocket for real-time progress updates in UI

### Cancellation

```http
POST /interrupt
```

Cancels the currently executing workflow. For queue management:

```http
POST /queue
{ "clear": true }  // clear entire queue
```

---

## Other Image Generation Integrations (Future)

Other integration candidates beyond MVP:

| Integration               | Type        | Notes                                                     |
| ------------------------- | ----------- | --------------------------------------------------------- |
| **Ollama**                | Local LLM   | OpenAI-compatible, good for text generation; no image gen |
| **LM Studio**             | Local LLM   | Desktop app, OpenAI-compatible API                        |
| **text-generation-webui** | Local LLM   | Gradio API, multiple backends                             |
| **KoboldCpp**             | Local LLM   | llama.cpp fork with extra features                        |
| **Draw Things**           | Local image | macOS/iOS app, stable diffusion                           |
| **Horde**                 | Distributed | Community-powered distributed inference                   |

---

## Implementation Checklist

- [ ] Create `src/generation/providers/image-generation.ts` — HTTP client for image generation backends
  - [ ] `POST /v1/images/generations` (OpenAI API path — MVP)
  - [ ] `POST /sdapi/v1/txt2img` (full control path — after MVP)
  - [ ] `POST /sdcpp/v1/img_gen` (async job path — after MVP)
  - [ ] `GET /sdcpp/v1/capabilities` (model discovery)
  - [ ] Job polling with exponential backoff for sdcpp async API
  - [ ] Streaming error recovery (partial content on reconnect failure)
- [ ] Register `"sd-cpp"` provider in the generation system
- [ ] Wire generated images through `assets/service.ts` (storage + linking)
- [ ] Add step type `"generate_image"` to the multi-step pipeline
- [ ] Add `healthCheck()` function with status transitions
- [ ] Add retry logic with exponential backoff + jitter
- [ ] Add configurable timeout per request and per generation
- [ ] Handle error codes: 400, 404, 429, 500, 503, timeout
- [ ] Add cancellation support (sdcpp async + OpenAI/WebUI abort)
- [ ] Integrate with `cancellation-manager.ts` for job tracking
- [ ] Integrate with `step-pipeline.ts` for multi-step orchestration
- [ ] Add env vars: `SDCPP_BASE_URL`, `SDCPP_API_FAMILY`, `SDCPP_TIMEOUT`, `SDCPP_GENERATION_TIMEOUT`, `SDCPP_RETRIES`
- [ ] Add health check on server startup
- [ ] Handle: base64 decode, error responses, timeout, partial failures

### Image Generation Presets

- [ ] Define `ImageGenerationPreset` type in `src/generation/gen-types-options.ts`
- [ ] Implement built-in presets: `fast`, `balanced`, `quality`, `detailed`, `anime`, `photo`
- [ ] Add preset resolution: chat-level → global default
- [ ] Store preset name in `chats.settings` JSON (`imageGenerationPreset` field)
- [ ] Map preset params to WebUI/sdcpp API fields (steps, cfg, sampler, resolution)
- [ ] Add per-message preset override in input area UI
- [ ] Add image preset selector to chat settings panel
- [ ] Update `docs/frontend/chat/overview.md` — expand "Generation Style Presets" section

### ComfyUI Integration (Future)

- [ ] Create `src/generation/providers/comfyui.ts` — HTTP client for ComfyUI API
  - [ ] `POST /prompt` (submit workflow)
  - [ ] `GET /history/{prompt_id}` (poll for results)
  - [ ] `POST /interrupt` (cancel execution)
  - [ ] `GET /object_info` (node discovery)
  - [ ] WebSocket connection for real-time progress
- [ ] Store workflow templates in `data/workflows/`
- [ ] Map loop-lore generation params to ComfyUI workflow nodes
- [ ] Handle workflow execution: submit → poll → download → asset pipeline

### Verification

- [ ] Test: `bun test` passes; `bun run check` passes
- [ ] Document model download and startup instructions in getting-started guide

## References

- [stable-diffusion.cpp README](https://github.com/leejet/stable-diffusion.cpp) — upstream project
- [Server API Reference](../stable-diffusion.cpp/examples/server/api.md) — full API spec (OpenAI, WebUI, sdcpp)
- [Build Instructions](../stable-diffusion.cpp/docs/build.md) — build from source
- [sd.cpp-webui](../sd.cpp-webui/) — reference web UI with API integration patterns
- [ComfyUI GitHub](https://github.com/comfyanonymous/ComfyUI) — node-based workflow editor
- [ComfyUI API Reference](https://docs.comfy.org/development/comfyui-server/comms_routes) — HTTP + WebSocket API
- [ComfyUI OpenAPI Spec](https://github.com/Comfy-Org/ComfyUI/blob/main/openapi.yaml) — official API spec
- [Krea 2 API](https://docs.krea.ai/developers/krea-2/overview) — foundation model, style transfer, moodboards
- [Ideogram 4 Prompting](https://github.com/ideogram-oss/ideogram4/blob/main/docs/prompting.md) — JSON caption format
- [Qwen Image 2.0](https://github.com/QwenLM/Qwen-Image) — native 2K, multilingual text rendering
- [LTX-2](https://github.com/Lightricks/LTX-2) — audio-video foundation model
- [Assets System](../assets.md) — loop-lore's media storage and linking
- [Generation Module](../implementation.md#generation-module) — loop-lore's generation system
- [Implementation Plan](../../meta/plan.md) — MVP roadmap

## Cross-References: Existing Codebase

| Spec concept                            | Codebase location                        | Notes                                         |
| --------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `GenerationResult`                      | `src/generation/gen-types-results.ts:10` | Result type for all generation (text + image) |
| `GenerationStep.name: "generate_image"` | `src/generation/gen-types-results.ts:72` | Step pipeline integration                     |
| `completeStep()` / `failStep()`         | `src/generation/step-pipeline.ts:28,56`  | Mark image step done/failed                   |
| `cancellation-manager`                  | `src/generation/cancellation-manager.ts` | Track active image generations                |
| `assets/service.ts`                     | `src/assets/service.ts`                  | Store generated images, link to messages      |
| `asset_links` table                     | `src/db/schema.ts`                       | Polymorphic FK linking assets to entities     |
| Config schema pattern                   | `src/config/schema.ts`                   | Follow existing `*Config` interface pattern   |
