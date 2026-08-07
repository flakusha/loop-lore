/** JSON-schema metadata for the sd-server auto-start sub-config. */
export const sdCppMeta = {
  type: "object",
  description: "Spawn sd-server as child process",
  properties: {
    enabled: { type: "boolean", description: "Enable auto-start", },
    modelType: {
      type: "string",
      enum: ["checkpoint", "diffusion",],
      description: "checkpoint = standalone (-m), diffusion = component (--diffusion-model, needs llm)",
    },
    modelPath: {
      type: "string",
      description: "Path to .safetensors model",
    },
    port: { type: "integer", description: "sd-server port", },
    llmPath: {
      type: "string",
      description: "LLM text encoder GGUF. Needed for most diffusion models.",
    },
    clipLPath: {
      type: "string",
      description: "CLIP-L text encoder (SD1.x/SD2.x)",
    },
    clipGPath: { type: "string", description: "CLIP-G text encoder", },
    t5xxlPath: { type: "string", description: "T5-XXL text encoder", },
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
    loraDir: { type: "string", description: "LoRA directory path", },
    taesdPath: {
      type: "string",
      description: "TAESD for fast low-quality decode",
    },
    hiresUpscalersDir: {
      type: "string",
      description: "Highres fix upscaler model directory",
    },
    embdDir: { type: "string", description: "Embeddings directory", },
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
      items: { type: "string", },
      description: "Extra CLI args",
    },
  },
  required: ["enabled", "modelType", "modelPath", "port",],
};
