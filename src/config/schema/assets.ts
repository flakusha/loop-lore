// src/config/schema/assets.ts — Asset storage config type

export interface AssetsConfig {
  enabled: boolean;
  uploadDir: string;
  maxFileSize: number;
  compression: boolean;
}
