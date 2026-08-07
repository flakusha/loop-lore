// src/config/schema/testing.ts — e2e external-server config type

export interface TestingConfig {
  /** Path to GGUF model for llama.cpp external-server e2e */
  llamaModel?: string;
  /** Path to safetensors model for sd-server external-server e2e */
  sdModel?: string;
  /** llama.cpp port for external-server e2e (default: 9011) */
  llamaPort?: number;
  /** sd-server port for external-server e2e (default: 9010) */
  sdPort?: number;
  /** llama-swap config yaml path for external-server e2e */
  llamaSwapConfig?: string;
}
