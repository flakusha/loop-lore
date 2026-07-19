// src/config/sections/generation.ts — Generation config section

import type {
  GenerationConfig,
  GenerationProvidersConfig,
  ProviderInstanceConfig,
  ModelRoleAssignment,
} from "../schema";

export const GENERATION_PROVIDERS_DEFAULTS = {
  openaiCompatible: [] as ProviderInstanceConfig[],
} satisfies GenerationProvidersConfig;

export const GENERATION_DEFAULTS = {
  providers: GENERATION_PROVIDERS_DEFAULTS,
  defaultProvider: "",
  defaultModels: {} as Record<string, string>,
  modelRoles: {} as Record<string, ModelRoleAssignment>,
} satisfies GenerationConfig;

export class GenerationSection implements GenerationConfig {
  providers: GenerationProvidersConfig = {
    openaiCompatible: [],
  };
  defaultProvider = GENERATION_DEFAULTS.defaultProvider;
  defaultModels: Record<string, string> = {};
  modelRoles: Record<string, ModelRoleAssignment> = {};
  autoStart: GenerationConfig["autoStart"];

  constructor(overrides?: Partial<GenerationConfig>) {
    if (!overrides) return;

    const { providers, ...rest } = overrides;
    Object.assign(this, rest);
    if (providers) {
      this.providers = { ...this.providers, ...providers };
    }
  }
}

export const generationMeta = {
  type: "object" as const,
  description: "LLM generation provider configuration",
  properties: {
    providers: {
      type: "object",
      properties: {
        openaiCompatible: {
          type: "array",
          description: "OpenAI-compatible provider instances",
        },
      },
    },
    defaultProvider: {
      type: "string",
      description: "Default provider name",
    },
    defaultModels: {
      type: "object",
      description: "Default model per provider",
    },
    autoStart: {
      type: "object",
      description: "Auto-spawn external AI servers at startup",
      properties: {
        llamaCpp: {
          type: "object",
          description: "Spawn llama.cpp server as child process",
          properties: {
            enabled: { type: "boolean", description: "Enable auto-start" },
            modelPath: {
              type: "string",
              description: "GGUF path or HF ref (org/repo:quant)",
            },
            port: { type: "integer", description: "llama-server port" },
            alias: { type: "string", description: "Model alias for API reference" },
            ctxSize: {
              type: "integer",
              description: "Context size in tokens",
            },
            threads: { type: "integer", description: "CPU threads (-1 = auto)" },
            nGpuLayers: {
              type: "string",
              description: "GPU layers: number, auto, or all",
            },
            device: {
              type: "string",
              description: "Comma-separated GPU device list",
            },
            mlock: {
              type: "boolean",
              description: "Force model to stay in RAM",
            },
            cacheTypeK: {
              type: "string",
              description: "KV cache type for K: f32, f16, q8_0, iq4_nl...",
            },
            cacheTypeV: { type: "string", description: "KV cache type for V" },
            cacheRam: {
              type: "integer",
              description: "KV cache RAM budget in MiB",
            },
            flashAttn: {
              type: "string",
              description: "Flash attention: on, off, or auto",
            },
            swaFull: {
              type: "boolean",
              description: "Use full-size SWA cache",
            },
            ropeScaling: {
              type: "string",
              description: "RoPE scaling: none, linear, yarn",
            },
            ropeScale: {
              type: "number",
              description: "RoPE context scaling factor",
            },
            temp: { type: "number", description: "Temperature sampler default" },
            topK: { type: "integer", description: "Top-K sampler default" },
            topP: { type: "number", description: "Top-P sampler default" },
            minP: { type: "number", description: "Min-P sampler default" },
            repeatPenalty: { type: "number", description: "Repeat penalty" },
            parallelRequests: {
              type: "integer",
              description: "Max parallel requests",
            },
            fit: {
              type: "boolean",
              description: "Flash inference tuning",
            },
            specType: {
              type: "string",
              description: "Speculative decoding: draft-eagle3, ngram-map-k4v...",
            },
            specDraftNMin: {
              type: "integer",
              description: "Min draft tokens for spec decoding",
            },
            specDraftNMax: {
              type: "integer",
              description: "Max draft tokens for spec decoding",
            },
            reasoningBudget: {
              type: "integer",
              description: "Reasoning budget in tokens (-1 = unlimited)",
            },
            jinja: {
              type: "boolean",
              description: "Enable Jinja templates (default enabled)",
            },
            extraArgs: {
              type: "array",
              items: { type: "string" },
              description: "Extra CLI args",
            },
          },
          required: ["enabled", "modelPath", "port"],
        },
        sdCpp: {
          type: "object",
          description: "Spawn sd-server as child process",
          properties: {
            enabled: { type: "boolean", description: "Enable auto-start" },
            modelType: {
              type: "string",
              enum: ["checkpoint", "diffusion"],
              description:
                "checkpoint = standalone (-m), diffusion = component (--diffusion-model, needs llm)",
            },
            modelPath: {
              type: "string",
              description: "Path to .safetensors model",
            },
            port: { type: "integer", description: "sd-server port" },
            llmPath: {
              type: "string",
              description: "LLM text encoder GGUF. Needed for most diffusion models.",
            },
            clipLPath: {
              type: "string",
              description: "CLIP-L text encoder (SD1.x/SD2.x)",
            },
            clipGPath: { type: "string", description: "CLIP-G text encoder" },
            t5xxlPath: { type: "string", description: "T5-XXL text encoder" },
            vaePath: {
              type: "string",
              description: "VAE safetensors path",
            },
            vaeFormat: {
              type: "string",
              description: "VAE latent format: auto, flux, sd3, flux2",
            },
            controlNetPath: {
              type: "string",
              description: "Control net model path",
            },
            loraDir: { type: "string", description: "LoRA directory path" },
            taesdPath: {
              type: "string",
              description: "TAESD for fast low-quality decode",
            },
            hiresUpscalersDir: {
              type: "string",
              description: "Highres fix upscaler model directory",
            },
            embdDir: { type: "string", description: "Embeddings directory" },
            photoMakerPath: {
              type: "string",
              description: "PhotoMaker model path",
            },
            upscaleModelPath: {
              type: "string",
              description: "ESRGAN upscale model path",
            },
            fa: {
              type: "boolean",
              description: "Global flash attention",
            },
            diffusionFA: {
              type: "boolean",
              description: "Flash attention in diffusion model only",
            },
            vaeTiling: {
              type: "boolean",
              description: "Process VAE in tiles to reduce memory",
            },
            eagerLoad: {
              type: "boolean",
              description: "Load all params at model-load time",
            },
            offloadToCPU: {
              type: "boolean",
              description: "Place weights in RAM, load to VRAM on demand",
            },
            streamLayers: {
              type: "boolean",
              description: "Enable residency+prefetch streaming (needs maxVram)",
            },
            autoFit: {
              type: "boolean",
              description: "Auto-pick device placements from model size + VRAM budget",
            },
            maxVram: {
              type: "string",
              description: "Max VRAM budget in GiB",
            },
            backend: {
              type: "string",
              description: "Runtime backend: e.g. clip=cpu,vae=cuda0,diffusion=vulkan0",
            },
            rng: {
              type: "string",
              description: "RNG: std_default, cuda, cpu",
            },
            samplerRng: {
              type: "string",
              description: "Sampler RNG. Defaults to --rng.",
            },
            type: {
              type: "string",
              description: "Weight type: f32, f16, q4_0, q8_0, etc.",
            },
            prediction: {
              type: "string",
              description: "Prediction type: eps, v, edm_v, sd3_flow, flux_flow",
            },
            cacheMode: {
              type: "string",
              description: "Cache: easycache, ucache, dbcache, spectrum",
            },
            cacheOption: {
              type: "string",
              description: "Cache params (key=value, comma-separated)",
            },
            extraArgs: {
              type: "array",
              items: { type: "string" },
              description: "Extra CLI args",
            },
          },
          required: ["enabled", "modelType", "modelPath", "port"],
        },
      },
    },
  },
};
