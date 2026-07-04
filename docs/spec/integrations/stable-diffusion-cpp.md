# stable-diffusion.cpp Integration

## Overview

[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) is a lightweight, pure C/C++ inference engine for diffusion models (SD1.x/2.x, SDXL, SD3, FLUX, Wan, and many more) built on [ggml](https://github.com/ggml-org/ggml) — the same backend as [llama.cpp](../llama.cpp/). The `sd-server` binary exposes three HTTP API families:

- **OpenAI API** (`/v1/...`) — compatible with OpenAI image generation endpoints
- **Stable Diffusion WebUI API** (`/sdapi/v1/...`) — compatible with AUTOMATIC1111's format
- **Native sdcpp API** (`/sdcpp/v1/...`) — full async job interface with all native controls

**Reference implementations**: `../stable-diffusion.cpp/` (upstream repo) and `../sd.cpp-webui/` (web UI wrapper with API integration patterns)

## Architecture

```
loop-lore                sd-server
  assets/service.ts ────► OpenAI API     (/v1/images/generations)
  generation/            WebUI API       (/sdapi/v1/txt2img)
  (new image pipeline)   Native API      (/sdcpp/v1/img_gen)
```

Three integration paths:

| API | Endpoint | Best For |
| --- | --- | --- |
| **OpenAI** | `POST /v1/images/generations` | Simple text-to-image, drop-in OpenAI client replacement |
| **OpenAI** | `POST /v1/images/edits` | Image-to-image / inpainting from multipart form data |
| **WebUI** | `POST /sdapi/v1/txt2img` | Full param control (sampler, scheduler, CFG, LoRA) |
| **WebUI** | `POST /sdapi/v1/img2img` | Full param control for image-to-image |
| **sdcpp** | `POST /sdcpp/v1/img_gen` | Async generation with job polling and queue management |

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

| Flag | Purpose |
| --- | --- |
| `--model, -m` | Path to diffusion model GGUF file |
| `--port` | HTTP port (default: 8080) |
| `--host` | Bind address (default: 127.0.0.1) |
| `--threads, -t` | Number of CPU threads |
| `--wtype` | Weight type (default, f32, f16, q4_0, q4_1, q5_0, q5_1, q8_0) |
| `--rng` | RNG type (std_default, cuda) |
| `--diffusion-fp16` | Run diffusion in fp16 mode |
| `--vae-fp16` | Run VAE in fp16 mode |
| `--control-net-path` | Path to ControlNet models |
| `--lora-model-dir` | Directory for LoRA models |
| `--embd-dir` | Directory for textual inversion embeddings |
| `--taesd-path` | Path to TAESD model for fast latent decoding |
| `--esrgan-path` | Path to ESRGAN upscaler model |
| `--hires-upscalers-dir` | Directory for hires fix upscaler models |
| `--output-dir` | Output directory for generated images |
| `--init-image` | Init image for img2img mode |
| `--mask-image` | Mask image for inpainting |
| `--strength` | Denoising strength (0.0–1.0) for img2img |
| `--cfg-scale` | CFG scale (guidance strength) |
| `--sample-method` | Sampler (euler_a, euler, heun, dpm2, lcm, ddim, dpm++ 2m, etc.) |
| `--scheduler` | Scheduler type |
| `--steps` | Number of sampling steps |
| `--seed` | Random seed (-1 = random) |
| `--batch-count` | Number of images to generate |
| `--clip-skip` | CLIP skip layers |

## API Families

### 1. OpenAI API (`/v1/...`)

Drop-in replacement for OpenAI's image generation API. Best for simple integration where loop-lore already has an OpenAI client.

#### `POST /v1/images/generations`

Takes standard OpenAI request fields:

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `prompt` | `string` | Yes | — | Text prompt for generation |
| `n` | `integer` | No | 1 | Number of images to generate |
| `size` | `string` | No | default | Format `WIDTHxHEIGHT` (e.g. `"1024x1024"`) |
| `output_format` | `string` | No | `"png"` | `"png"`, `"jpeg"`, or `"webp"` |
| `output_compression` | `integer` | No | 100 | Compression level (0–100) |

**Response**:

```json
{
  "created": 1775401200,
  "output_format": "png",
  "data": [
    {"b64_json": "iVBORw0KGgo..."}
  ]
}
```

#### `POST /v1/images/edits`

Image-to-image / inpainting via multipart form data:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `prompt` | `string` | Yes | Text prompt |
| `image[]` | `file[]` | One of | Preferred image upload field (multiple) |
| `image` | `file` | One of | Legacy single-image upload |
| `mask` | `file` | No | Optional mask for inpainting |
| `n` | `integer` | No | Number of images |
| `size` | `string` | No | `WIDTHxHEIGHT` format |
| `output_format` | `string` | No | `"png"` or `"jpeg"` |

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

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `prompt` | `string` | — | Required |
| `negative_prompt` | `string` | `""` | Negative prompt |
| `width` | `integer` | 512 | Image width |
| `height` | `integer` | 512 | Image height |
| `steps` | `integer` | server default | Sampling steps |
| `cfg_scale` | `number` | server default | CFG / text guidance scale |
| `seed` | `integer` | -1 | -1 = random |
| `batch_size` | `integer` | 1 | Number of images |
| `clip_skip` | `integer` | — | CLIP skip (optional) |
| `sampler_name` | `string` | — | `"euler_a"`, `"euler"`, `"dpm++ 2m"`, `"lcm"`, etc. |
| `scheduler` | `string` | — | Scheduler type |
| `lora` | `array[object]` | — | Structured LoRA list: `[{"path": "...", "multiplier": 0.8}]` |
| `enable_hr` | `boolean` | false | Enable hires fix |
| `hr_scale` | `number` | — | Hires upscale scale |
| `hr_resize_x` | `integer` | — | Hires target width |
| `hr_resize_y` | `integer` | — | Hires target height |
| `hr_steps` | `integer` | — | Hires second-pass steps |
| `hr_upscaler` | `string` | — | Upscaler name (`"Lanczos"`, `"Nearest"`, latent modes, or model name) |
| `denoising_strength` | `number` | — | Hires denoising strength (txt2img) |

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

| Field | Type | Notes |
| --- | --- | --- |
| `init_images` | `array[string]` | Base64 or data URL input images |
| `mask` | `string` | Base64 or data URL mask (optional) |
| `inpainting_mask_invert` | `integer\|boolean` | Invert mask flag |
| `denoising_strength` | `number` | Image-to-image strength (clamped 0.0–1.0) |

#### Discovery Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/sdapi/v1/loras` | List available LoRA models |
| `GET` | `/sdapi/v1/upscalers` | List available upscalers (built-in + model-backed) |
| `GET` | `/sdapi/v1/latent-upscale-modes` | List latent upscale modes |
| `GET` | `/sdapi/v1/samplers` | List available samplers |
| `GET` | `/sdapi/v1/schedulers` | List available schedulers |
| `GET` | `/sdapi/v1/sd-models` | Show loaded model metadata |
| `GET` | `/sdapi/v1/options` | Show server options (output format, model) |

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
    "name": "FLUX.2-klein",
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

| Use Case | Recommended API | Reason |
| --- | --- | --- |
| Simple text-to-image from chat | OpenAI API (`/v1/images/generations`) | Drop-in OpenAI compatibility, minimal code |
| Full param control in image pipeline | WebUI API (`/sdapi/v1/txt2img`) | Sampler, scheduler, CFG, LoRA, hires fix |
| Background generation with UI feedback | sdcpp API (`/sdcpp/v1/img_gen`) | Async job polling, queue management, progress |
| Capability discovery | sdcpp API (`/sdcpp/v1/capabilities`) | Model info, samplers, limits in one call |
| Image-to-image / inpainting | OpenAI API (`/v1/images/edits`) or WebUI (`/sdapi/v1/img2img`) | Both support it; WebUI has more control |
| LoRA management | WebUI API (`/sdapi/v1/loras`) | Structured LoRA list with names and paths |

**MVP recommendation**: Use the **OpenAI API** (`/v1/images/generations`) as the primary integration target — it requires minimal new code since it shares shape with the existing OpenAI-compatible generation flow. For advanced features (LoRA, hires, sampler selection), fall back to the **WebUI API**.

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
2. Receive base64-encoded image bytes
3. Save through the assets system (`src/assets/`) as a new asset
4. Link the asset to the message via `asset_links` (polymorphic FK)
5. Return an asset reference in the generation result

### Asset Pipeline

Images generated by sd-server flow through loop-lore's existing asset system:

```
sd-server ──► base64 image ──► assets/service.ts ──► asset_links ──► message
                                    │
                                    ▼
                              file on disk
                          (data/assets/raw/...)
```

The assets system (see [`docs/assets.md`](./assets.md)) handles:
- Storage to `data/assets/raw/` with UUID-derived paths
- Optional compression variants (WebP thumbnails)
- Polymorphic linking to any entity (message, character, world)

### Configuration

```typescript
// src/generation/providers/sd-cpp.ts
interface SdCppConfig {
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
}
```

Env vars:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SDCPP_BASE_URL` | `http://localhost:9000` | sd-server endpoint |
| `SDCPP_API_FAMILY` | `openai` | API family to use |
| `SDCPP_DEFAULT_WIDTH` | `1024` | Default image width |
| `SDCPP_DEFAULT_HEIGHT` | `1024` | Default image height |
| `SDCPP_DEFAULT_STEPS` | `28` | Default sampling steps |
| `SDCPP_DEFAULT_CFG` | `7.5` | Default CFG scale |

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

| Model Family | Doc | Notes |
| --- | --- | --- |
| SD 1.x / 2.x | [sd.md](../stable-diffusion.cpp/docs/sd.md) | Legacy, widely compatible |
| SDXL / SDXL-Turbo | [sd.md](../stable-diffusion.cpp/docs/sd.md) | Higher quality, more VRAM |
| SD3 / SD3.5 | [sd3.md](../stable-diffusion.cpp/docs/sd3.md) | Latest Stability models |
| FLUX.1-dev/schnell | [flux.md](../stable-diffusion.cpp/docs/flux.md) | Fast, high-quality |
| FLUX.2-dev/klein | [flux2.md](../stable-diffusion.cpp/docs/flux2.md) | Latest FLUX generation |
| Krea 2 | [krea2.md](../stable-diffusion.cpp/docs/krea2.md) | High-quality image generation |
| Chroma / Chroma1 Radiance | [chroma.md](../stable-diffusion.cpp/docs/chroma.md) | Fast transformer-based |
| Qwen Image | [qwen_image.md](../stable-diffusion.cpp/docs/qwen_image.md) | Qwen vision models |
| Wan 2.1 / 2.2 | [wan.md](../stable-diffusion.cpp/docs/wan.md) | Video generation |
| LTX-2.3 | [ltx2.md](../stable-diffusion.cpp/docs/ltx2.md) | Video generation |
| HiDream-O1, Ideogram4, Lens | docs above | Various modern architectures |

Models typically need to be in GGUF format (quantized). The VAE (autoencoder) model can be embedded in the main GGUF or loaded separately.

---

## Implementation Checklist

- [ ] Create `src/generation/providers/sd-cpp.ts` — HTTP client for `sd-server`
  - [ ] `POST /v1/images/generations` (OpenAI API path — MVP)
  - [ ] `POST /sdapi/v1/txt2img` (full control path — after MVP)
  - [ ] `POST /sdcpp/v1/img_gen` (async job path — after MVP)
  - [ ] `GET /sdcpp/v1/capabilities` (model discovery)
- [ ] Register `"sd-cpp"` provider in the generation system
- [ ] Wire generated images through `assets/service.ts` (storage + linking)
- [ ] Add step type `"generate_image"` to the multi-step pipeline
- [ ] Add env vars for sd-server configuration
- [ ] Add health check on server startup
- [ ] Handle: base64 decode, error responses, timeout
- [ ] Test: `bun test` passes; `bun run check` passes
- [ ] Document model download and startup instructions in getting-started guide

## References

- [stable-diffusion.cpp README](https://github.com/leejet/stable-diffusion.cpp) — upstream project
- [Server API Reference](../stable-diffusion.cpp/examples/server/api.md) — full API spec (OpenAI, WebUI, sdcpp)
- [Build Instructions](../stable-diffusion.cpp/docs/build.md) — build from source
- [sd.cpp-webui](../sd.cpp-webui/) — reference web UI with API integration patterns
- [Assets System](./assets.md) — loop-lore's media storage and linking
- [Generation Module](./implementation.md#generation-module) — loop-lore's generation system
- [Implementation Plan](./plan.md) — MVP roadmap