# Image Generation: sd-server Integration

Backend: `stable-diffusion.cpp` (`sd-server`). Local image generation server using `stable-diffusion.cpp` with three API families.

## Building sd-server

## Starting

```bash
sd-server --model /path/to/model.gguf --port 9000
```

Key flags: `--threads`, `--wtype`, `--rng`, `--diffusion-fp16`, `--vae-fp16`, `--control-net-path`, `--lora-model-dir`, `--embd-dir`, `--taesd-path`, `--esrgan-path`, `--output-dir`, `--cfg-scale`, `--sample-method`, `--steps`, `--seed`, `--batch-count`, `--clip-skip`.

## API Families

### 1. OpenAI API (`/v1/...`)

**`POST /v1/images/generations`** — standard OpenAI fields: `prompt`, `n`, `size` (`WIDTHxHEIGHT`), `output_format` (png/jpeg/webp). Response: `{ data: [{ b64_json }] }`.

**`POST /v1/images/edits`** — image-to-image via multipart: `prompt`, `image[]`/`image`, `mask`, `n`, `size`, `output_format`.

**Native extension**: embed sdcpp params in prompt: `"a landscape <sd_cpp_extra_args>{\"sample_params\":{\"sample_steps\":28}}</sd_cpp_extra_args>"` — extracted and stripped before generation.

### 2. WebUI API (`/sdapi/v1/...`)

**`POST /sdapi/v1/txt2img`** — full param control:

| Field | Type | Notes |
| ----- | ---- | ----- |
| `prompt` | string | Required |
| `negative_prompt` | string | |
| `width`, `height` | int | Default 512 |
| `steps` | int | Sampling steps |
| `cfg_scale` | number | Guidance scale |
| `seed` | int | -1 = random |
| `batch_size` | int | |
| `sampler_name` | string | `euler_a`, `euler`, `dpm++ 2m`, `lcm` |
| `scheduler` | string | |
| `lora` | array | `[{path, multiplier}]` |
| `enable_hr` | boolean | Hires fix |
| `hr_scale`, `hr_steps`, `hr_upscaler` | | Hires params |

**`POST /sdapi/v1/img2img`** — same + `init_images`, `mask`, `denoising_strength`.

**Discovery endpoints**: `GET /sdapi/v1/loras`, `/upscalers`, `/latent-upscale-modes`, `/samplers`, `/schedulers`, `/sd-models`, `/options`.

### 3. Native sdcpp API (`/sdcpp/v1/...`)

Async job-based API. `POST /sdcpp/v1/img_gen` → 202 with `{ id, status: "queued" }`. Poll `GET /sdcpp/v1/jobs/{id}`. Cancel: `POST /sdcpp/v1/jobs/{id}/cancel`.

Job fields: `prompt`, `negative_prompt`, `width`, `height`, `seed`, `batch_count`, `sample_params` (steps, method, scheduler, guidance), `lora_map`, `control_net`, `hires` params, `init_image`, `mask_image`, `clip_skip`, `output_format`.

**`GET /sdcpp/v1/capabilities`** — model info, supported modes, defaults, samplers, schedulers, LoRAs, limits.

## Integration Decision

| Use Case                  | Recommended API              |
| ------------------------- | ---------------------------- |
| Simple text-to-image      | OpenAI API                   |
| Full param control        | WebUI API                    |
| Background + UI feedback  | sdcpp API (async job polling)|
| Capability discovery      | sdcpp API                    |
| Image-to-image/inpainting | OpenAI or WebUI              |
| LoRA management           | WebUI API                    |

**MVP**: OpenAI API (minimal new code, shares shape with existing OpenAI-compatible gen flow).

## Error Handling

| Code | Meaning          | Action                             |
| ---- | ---------------- | ---------------------------------- |
| 400  | Bad request      | Fail, surface to user              |
| 404  | Model not loaded | "model not available"              |
| 429  | Queue full       | Retry with backoff                 |
| 500  | Server error     | Retry up to `retries`              |
| 503  | Loading model    | Retry with backoff                 |

Retry: exponential backoff with jitter. Generation timeout: default 5 min (separate from connection timeout).

## Image Generation Presets

| Preset     | Steps | CFG | Resolution | Sampler    | Use Case                |
| ---------- | ----- | --- | ---------- | ---------- | ----------------------- |
| `fast`     | 15    | 5.0 | 512×512    | `lcm`      | Quick drafts            |
| `balanced` | 25    | 7.0 | 1024×1024  | `euler_a`  | General purpose         |
| `quality`  | 40    | 8.0 | 1024×1024  | `dpm++ 2m` | Final output            |
| `detailed` | 50    | 9.0 | 1536×1536  | `euler`    | Maximum detail          |
| `anime`    | 30    | 7.5 | 1024×1024  | `euler_a`  | Anime/illustration      |
| `photo`    | 35    | 7.0 | 1024×1024  | `dpm++ 2m` | Photorealistic          |

Resolution order: chat-level → global default (`balanced`).

## Integration with loop-lore

Generation steps: `["generate_text", "generate_image", "caption", "attach_asset"]`.
Image step: call sd-server → save via `assets/service.ts` → link via `asset_links` → return asset reference.

Cancellation: sdcpp async → `POST /sdcpp/v1/jobs/{id}/cancel`. OpenAI/WebUI sync → `AbortController`.

## Supported Model Families

SD 1.x/2.x, SDXL (incl. Illustrious, NoobAI, Pony), SD3/SD3.5, FLUX.1/FLUX.2, Krea 2, Ideogram 4, Qwen Image 2.0, Chroma, HiDream-O1, Wan 2.1/2.2 (video), LTX-2.3 (video+audio).

### Prompt Styles per Model

| Family              | Style                    | Token Limit |
| ------------------- | ------------------------ | ----------- |
| SD 1.x/2.x          | Comma-separated tags     | <75         |
| SDXL                | Descriptive paragraphs   | 77-150      |
| SDXL fine-tunes     | Booru tags + natural     | 77-150      |
| SD3/FLUX            | Detailed natural language| 100-300     |
| Krea 2              | Natural + creativity slider| 100-300   |
| Ideogram 4          | JSON captions            | 100-300     |
| Qwen Image 2.0      | Multilingual, detailed   | 100-300     |
| Video (Wan/LTX-2)   | Natural + motion         | 100-300     |

## LLM Prompt Templates for SD

When user triggers image gen from chat, LLM converts context to SD prompt per model profile:

| Family           | Format             | Key Trait                     |
| ---------------- | ------------------ | ----------------------------- |
| SD1/SD2/tags     | `tags`             | CLIP 75-token limit           |
| SDXL             | `tags`             | 150-token limit               |
| Illustrious/Noob | `tags`             | Danbooru vocabulary, CFG 3-6  |
| Pony             | `tags`             | Score tags required, CFG 6-8+ |
| SD3/FLUX         | `natural`          | T5 tokenizer, long desc       |
| Krea 2           | `natural`          | Low step count                |
| Ideogram 4       | `json`             | JSON caption format           |
| Qwen/Chroma      | `natural`          | Long context, multilingual    |

Templates in `src/generation/prompt-templates.ts`. Detail levels: `instant` (~160 tokens), `balanced` (~320), `detailed` (~600).

## LoRA Integration

Methods: in-prompt injection (`<sd_cpp_extra_args>`), WebUI `lora` array, sdcpp `lora_map`. Store LoRA preferences in `chats.settings` or `actors.settings` JSON.

## ComfyUI Integration (Future)

Node-based workflow editor for complex pipelines (img2img + ControlNet + upscaling, video).
Key endpoints: `POST /prompt`, `GET /history/{prompt_id}`, `POST /interrupt`, `GET /object_info`, `/ws` (WebSocket progress).
Use when: complex multi-step needed. Not for simple text-to-image.

## Config

Env vars: `SDCPP_BASE_URL`, `SDCPP_API_FAMILY`, `SDCPP_DEFAULT_WIDTH/HEIGHT/STEPS/CFG`, `SDCPP_TIMEOUT`, `SDCPP_GENERATION_TIMEOUT`, `SDCPP_RETRIES`.

## References

- `stable-diffusion.cpp` upstream: https://github.com/leejet/stable-diffusion.cpp
- Server API: `../stable-diffusion.cpp/examples/server/api.md`
- Build: `../stable-diffusion.cpp/docs/build.md`
- Assets: `docs/spec/assets.md`
- Generation: `docs/spec/implementation.md#generation-module`