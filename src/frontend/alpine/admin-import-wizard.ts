// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, jsonParseOr, safeJsonStringify, } from "./json";

/** One row of the import preview table. */
export interface ImportPreviewRow {
  key: string;
  value: string;
  isSecret: boolean;
  willOverwrite: boolean;
}

/** Row shape for the yaml/toml serializers. */
interface KeyValueRow {
  key: string;
  value: string;
}

/** Host state the wizard slice reads — subset of the admin page state. */
interface ImportWizardHost {
  systemConfig: { key: string }[];
  importWizard: {
    open: boolean;
    step: 1 | 2 | 3;
    format: "yaml" | "toml";
    fileName: string;
    preview: ImportPreviewRow[];
    error: string;
  };
  loadSystemConfig(): Promise<void>;
  buildImportPreview(content: string,): ImportPreviewRow[];
  parseSimpleYaml(content: string,): { system_config?: Record<string, string> };
  parseSimpleToml(content: string,): { system_config?: Record<string, string> };
}

/**
 * Setup-wizard slice (TASK-frontend-setup-wizard): upload, preview, apply.
 * @returns Wizard state plus upload/preview/apply methods bound by the host.
 */
export function adminImportWizard(this: ImportWizardHost,) {
  return {
    importWizard: {
      open: false,
      step: 1 as 1 | 2 | 3,
      format: "yaml" as "yaml" | "toml",
      fileName: "",
      preview: [] as ImportPreviewRow[],
      error: "",
    },
    openImportWizard(this: ImportWizardHost,) {
      this.importWizard.open = true;
      this.importWizard.step = 1;
      this.importWizard.preview = [];
      this.importWizard.error = "";
      this.importWizard.fileName = "";
    },
    cancelImport(this: ImportWizardHost,) {
      this.importWizard.open = false;
    },
    async handleFileSelect(this: ImportWizardHost, event: Event,) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) { return; }
      if (file.size > 1024 * 1024) {
        this.importWizard.error = "File exceeds 1MB limit";
        return;
      }
      this.importWizard.fileName = file.name;
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".toml",)) { this.importWizard.format = "toml"; }
      else if (lower.endsWith(".yaml",) || lower.endsWith(".yml",)) { this.importWizard.format = "yaml"; }
      else {
        this.importWizard.error = "Unknown format — use .yaml, .yml, or .toml";
        return;
      }
      try {
        const content = await file.text();
        const preview = this.buildImportPreview(content,);
        this.importWizard.preview = preview;
        this.importWizard.error = "";
        this.importWizard.step = 2;
      } catch (error) {
        this.importWizard.error = (error as Error).message;
      }
    },
    /**
     * Parse client-side just enough to build a preview; the server still validates and persists.
     * @param content - Raw file text.
     * @returns Preview rows (possibly empty on unparsable input).
     */
    buildImportPreview(this: ImportWizardHost, content: string,): ImportPreviewRow[] {
      let parsed: unknown;
      if (this.importWizard.format === "yaml") {
        parsed = this.parseSimpleYaml(content,);
      } else {
        // TOML has no browser parser; try JSON first (harmless), then the lenient line-based TOML parse.
        const attempt = jsonParseOr<unknown>(content, undefined,);
        parsed = attempt === undefined ? this.parseSimpleToml(content,) : attempt;
      }
      const root = (parsed as { system_config?: Record<string, unknown> } | null)?.system_config;
      if (typeof root !== "object" || root === null) { return []; }
      const existing = new Set(this.systemConfig.map((c,) => c.key),);
      const secretRe =
        /secret|password|token|api.?key|private.?key|mesh.?psk|encryption.?key|signed.?url|db\.url|database.?url/iu;
      const entries: ImportPreviewRow[] = [];
      for (const [k, v,] of Object.entries(root,)) {
        if (typeof v !== "string") { continue; }
        entries.push({ key: k, value: v, isSecret: secretRe.test(k,), willOverwrite: existing.has(k,), },);
      }
      return entries;
    },
    /**
     * Minimal YAML parser sufficient for flat `system_config: { key: value, … }` exports.
     * @param content - Raw file text.
     * @returns Parsed `system_config` mapping (possibly empty).
     */
    parseSimpleYaml(content: string,): { system_config?: Record<string, string> } {
      const lines = content.split("\n",);
      let inBlock = false;
      const out: Record<string, string> = {};
      for (const raw of lines) {
        const line = raw.replace(/#.*$/, "",).trimEnd();
        if (!line) { continue; }
        if (!inBlock && /^system_config:\s*$/.test(line,)) {
          inBlock = true;
          continue;
        }
        if (inBlock && /^\S/.test(line,)) { break; }
        const m = /^  ([A-Za-z0-9._-]+):\s*(.*)$/.exec(line,);
        if (m) {
          let v = m[2] ?? "";
          if ((v.startsWith('"',) && v.endsWith('"',)) || (v.startsWith("'",) && v.endsWith("'",))) {
            v = v.slice(1, -1,);
          }
          out[m[1]!] = v;
        }
      }
      return { system_config: out, };
    },
    /**
     * Minimal TOML parser sufficient for the `[system_config]` table the export emits.
     * @param content - Raw file text.
     * @returns Parsed `system_config` mapping (possibly empty).
     */
    parseSimpleToml(content: string,): { system_config?: Record<string, string> } {
      const lines = content.split("\n",);
      let inBlock = false;
      const out: Record<string, string> = {};
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#",)) { continue; }
        if (!inBlock && /^\[system_config\]$/.test(line,)) {
          inBlock = true;
          continue;
        }
        if (inBlock && line.startsWith("[",)) { break; }
        const m = /^"([^"]+)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(line,) ??
          /^([A-Za-z0-9._-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(line,);
        if (m) { out[m[1]!] = m[2]!.replace(/\\"/g, '"',); }
      }
      return { system_config: out, };
    },
    async confirmImport(
      this: ImportWizardHost & {
        stringifySimpleYaml(r: KeyValueRow[],): string;
        stringifySimpleToml(r: KeyValueRow[],): string;
      },
    ) {
      try {
        const content = this.importWizard.format === "yaml"
          ? this.stringifySimpleYaml(this.importWizard.preview,)
          : this.stringifySimpleToml(this.importWizard.preview,);
        const res = await apiFetch("/api/v1/admin/system-config/import", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ format: this.importWizard.format, content, },),
        },);
        if (res.ok) {
          const body = await res.json() as { imported: number; changed: number; skipped: number; conflicts: number };
          showToast(
            "success",
            `Imported ${body.imported}, changed ${body.changed}, skipped ${body.skipped}, conflicts ${body.conflicts}`,
          );
          this.importWizard.open = false;
          await this.loadSystemConfig();
        } else {
          const err = await res.json() as { message?: string };
          this.importWizard.error = err.message || "Import failed";
        }
      } catch (error) {
        this.importWizard.error = (error as Error).message;
      }
    },
    /**
     * Serialize preview rows back to the export YAML shape for the import POST.
     * @param rows - Preview rows.
     * @returns YAML text under a `system_config:` root.
     */
    stringifySimpleYaml(rows: KeyValueRow[],): string {
      const lines = ["system_config:",];
      for (const { key, value, } of rows) {
        const v = safeJsonStringify(value,);
        lines.push(`  ${key}: ${v.ok ? v.value : '""'}`,);
      }
      return lines.join("\n",) + "\n";
    },
    /**
     * Serialize preview rows back to the export TOML shape for the import POST.
     * @param rows - Preview rows.
     * @returns TOML text under a `[system_config]` table.
     */
    stringifySimpleToml(rows: KeyValueRow[],): string {
      const lines = ["[system_config]",];
      for (const { key, value, } of rows) {
        const k = safeJsonStringify(key,);
        const v = safeJsonStringify(value,);
        lines.push(`${k.ok ? k.value : '""'} = ${v.ok ? v.value : '""'}`,);
      }
      return lines.join("\n",) + "\n";
    },
  };
}
