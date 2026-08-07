export interface ProviderInfo {
  name: string;
  label: string;
  capabilities: {
    type: string;
    text: boolean;
    image: boolean;
    embeddings: boolean;
    streaming: boolean;
    tools: boolean;
    thinking: boolean;
  };
  status: string;
  modelCount: number;
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

export interface ModelRolesResponse {
  roles: { role: string; provider: string; model: string; source: string }[];
  overrides: Record<string, { provider: string; model: string }>;
  validRoles: string[];
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  origin: string;
  enabled: boolean;
  routeCount: number;
}

export interface ModelInfo {
  id: string;
  ownedBy?: string;
  contextWindow?: number;
  maxOutput?: number;
  thinking?: boolean;
  modalities?: string[];
  toolCalling?: boolean;
  paramSize?: string;
  raw?: Record<string, unknown>;
}

export interface ModelsState {
  providers: ProviderInfo[];
  providerModels: Record<string, ModelInfo[]>;
  modelRoleList: { role: string; provider: string; model: string }[];
  overrides: Record<string, { provider: string; model: string }>;
  loadingModels: boolean;
  scanning: boolean;
  expandProvider: string;
  pluginList: PluginInfo[];
  loadingPlugins: boolean;
  sdStatus: "running" | "stopped" | "unknown";
  sdPort: number;
  sdLatencyMs: number | null;
  showSdConfig: boolean;
  sdConfig: {
    enabled: boolean;
    port: number;
    modelPath: string;
    modelType: string;
    llmPath: string;
    preferredBackend: string;
  };
  comfyuiConfig: { url: string; enabled: boolean };
  loadModels(): Promise<void>;
  loadProviderModels(name: string,): Promise<void>;
  loadModelRoles(): Promise<void>;
  getModelsForRole(role: string,): ModelInfo[];
  getProviderModels(name: string,): ModelInfo[];
  getSelectedModel(role: string,): ModelInfo | undefined;
  modelSummary(m: ModelInfo | undefined,): string;
  modelSuitability(m: ModelInfo | undefined,): string;
  onRoleProviderChange(role: string,): void;
  saveModelRole(role: string,): Promise<void>;
  clearModelRole(role: string,): Promise<void>;
  rescanProviders(): Promise<void>;
  loadSdStatus(): Promise<void>;
  loadPlugins(): Promise<void>;
  togglePlugin(name: string, enable: boolean,): Promise<void>;
  loadSdConfig(): Promise<void>;
  saveSdConfig(): Promise<void>;
}
