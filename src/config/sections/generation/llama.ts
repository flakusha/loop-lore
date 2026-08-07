/** JSON-schema metadata for the llama.cpp auto-start sub-config. */
export const llamaCppMeta = {
  type: "object",
  description: "Spawn llama.cpp server as child process",
  properties: {
    enabled: { type: "boolean", description: "Enable auto-start", },
    modelPath: {
      type: "string",
      description: "GGUF path or HF ref (org/repo:quant)",
    },
    port: { type: "integer", description: "llama-server port", },
    alias: { type: "string", description: "Model alias for API reference", },
    ctxSize: {
      type: "integer",
      description: "Context size in tokens",
    },
    threads: { type: "integer", description: "CPU threads (-1 = auto)", },
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
    cacheTypeV: { type: "string", description: "KV cache type for V", },
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
    temp: { type: "number", description: "Temperature sampler default", },
    topK: { type: "integer", description: "Top-K sampler default", },
    topP: { type: "number", description: "Top-P sampler default", },
    minP: { type: "number", description: "Min-P sampler default", },
    repeatPenalty: { type: "number", description: "Repeat penalty", },
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
      items: { type: "string", },
      description: "Extra CLI args",
    },
  },
  required: ["enabled", "modelPath", "port",],
};
