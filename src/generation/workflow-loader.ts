/**
 * Workflow Loader — Load ComfyUI workflow JSON files from disk
 *
 * Reads workflow definitions from `configs/workflows/` directory,
 * caches them in memory, and applies template variable substitution.
 *
 * Workflow files are standard ComfyUI API-format JSON with
 * `{{variable}}` placeholders in node inputs.
 *
 * @module workflow-loader
 */

import { readdir, readFile, stat, } from "node:fs/promises";
import { extname, join, } from "node:path";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import type { ComfyUIWorkflow, } from "./providers/comfyui";
import {
  applyNodeOverrides,
  buildSubstitutionVars,
  substituteWorkflow,
  type SubstitutionVars,
} from "./workflow-substitutor";

/** Lazy logger access — avoids top-level init-order crash */

/** Workflow metadata parsed from filename */
interface WorkflowMeta {
  /** Workflow name (filename without extension) */
  name: string;
  /** Full file path */
  path: string;
  /** Last modified timestamp for cache invalidation */
  mtime: number;
}

/** Options for loading and substituting a workflow */
export interface LoadWorkflowOptions {
  /** Workflow name (filename without extension, e.g. "txt2img") */
  name: string;
  /** Variable substitutions for {{placeholder}} replacement */
  vars?: SubstitutionVars;
  /** Node-targeted overrides (nodeId → field → value) */
  nodeOverrides?: Map<string, Record<string, unknown>>;
}

/** Default workflows directory (relative to project root) */
const DEFAULT_WORKFLOWS_DIR = "configs/workflows";

class WorkflowLoader {
  private workflowsDir: string;
  private cache = new Map<string, { meta: WorkflowMeta; workflow: ComfyUIWorkflow }>();
  private dirMtime = 0;

  constructor(workflowsDir: string = DEFAULT_WORKFLOWS_DIR,) {
    this.workflowsDir = workflowsDir;
  }

  /**
   * List all available workflow names.
   *
   * Scans the workflows directory for `.json` files and returns
   * their names (filename without extension).
   *
   * @returns Array of workflow names
   */
  async listWorkflows(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.cache.keys(),];
  }

  /**
   * Load a workflow by name with optional template substitution.
   *
   * @param options - Workflow name and substitution parameters
   * @returns ComfyUI-ready workflow with placeholders replaced
   * @throws If workflow not found
   */
  async loadWorkflow(options: LoadWorkflowOptions,): Promise<ComfyUIWorkflow> {
    await this.ensureLoaded();

    const entry = this.cache.get(options.name,);
    if (!entry) {
      throw new Error(
        `Workflow "${options.name}" not found. Available: ${[...this.cache.keys(),].join(", ",)}`,
      );
    }

    let workflow = entry.workflow;

    // Apply node-targeted overrides first
    if (options.nodeOverrides && options.nodeOverrides.size > 0) {
      workflow = applyNodeOverrides(workflow, options.nodeOverrides,);
    }

    // Apply template variable substitution
    if (options.vars && Object.keys(options.vars,).length > 0) {
      workflow = substituteWorkflow(workflow, options.vars,);
    }

    return workflow;
  }

  /**
   * Reload workflows from disk (invalidates cache).
   */
  async reload(): Promise<void> {
    this.cache.clear();
    this.dirMtime = 0;
    await this.ensureLoaded();
  }

  /**
   * Get raw workflow JSON without substitution (for inspection/debugging).
   */
  async getRawWorkflow(name: string,): Promise<ComfyUIWorkflow | null> {
    await this.ensureLoaded();
    const entry = this.cache.get(name,);
    return entry?.workflow ?? null;
  }

  // ── Internal ──────────────────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    const dirPath = this.resolveWorkflowsDir();

    try {
      const fileStat = await stat(dirPath,);
      const currentMtime = fileStat.mtimeMs;

      // Skip reload if directory hasn't changed
      if (currentMtime <= this.dirMtime && this.cache.size > 0) {
        return;
      }

      this.dirMtime = currentMtime;
    } catch {
      // Directory doesn't exist or can't be stat'd — skip
      return;
    }

    await this.loadFromDisk(dirPath,);
  }

  private async loadFromDisk(dirPath: string,): Promise<void> {
    let filenames: string[];
    try {
      filenames = await readdir(dirPath,);
    } catch (error) {
      getLogger().warn({ message: "Failed to read workflows directory", path: dirPath, error: String(error,), },);
      return;
    }

    const jsonFiles: string[] = [];
    for (const name of filenames) {
      if (extname(name,) === ".json") {
        jsonFiles.push(name,);
      }
    }

    for (const filename of jsonFiles) {
      const filePath = join(dirPath, filename,);
      const name = filename.replace(/\.json$/, "",);

      try {
        const content = await readFile(filePath, "utf8",);
        const parsed = jsonParseOr<ComfyUIWorkflow | null>(content, null,);
        if (!parsed) {
          getLogger().warn({ message: "Invalid JSON in workflow file", file: filename, },);
          continue;
        }

        if (!this.isValidWorkflow(parsed,)) {
          getLogger().warn({ message: "Invalid workflow format, skipping", file: filename, },);
          continue;
        }

        const fileStat = await stat(filePath,);
        this.cache.set(name, {
          meta: { name, path: filePath, mtime: fileStat.mtimeMs, },
          workflow: parsed,
        },);

        getLogger().debug({ message: "Loaded workflow", name, nodes: Object.keys(parsed,).length, },);
      } catch (error) {
        getLogger().warn({
          message: "Failed to load workflow",
          file: filename,
          error: String(error,),
        },);
      }
    }

    getLogger().info({ message: "Workflows loaded", count: this.cache.size, dir: dirPath, },);
  }

  /**
   * Validate that a parsed JSON object is a valid ComfyUI workflow.
   *
   * A valid workflow is a Record where each value has `inputs` and `class_type`.
   */
  private isValidWorkflow(obj: unknown,): obj is ComfyUIWorkflow {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj,)) {
      return false;
    }

    const entries = Object.entries(obj as Record<string, unknown>,);
    if (entries.length === 0) { return false; }

    // Check that at least one entry has the expected structure
    for (const [, value,] of entries) {
      if (typeof value !== "object" || value === null) { continue; }
      const node = value as Record<string, unknown>;
      if ("inputs" in node && "class_type" in node) {
        return true;
      }
    }
    return false;
  }

  private resolveWorkflowsDir(): string {
    // Resolve relative to project root
    const root = process.cwd();
    return join(root, this.workflowsDir,);
  }
}

/** Singleton workflow loader instance */
let _instance: WorkflowLoader | null = null;

/**
 * Get or create the singleton workflow loader.
 *
 * @param workflowsDir - Optional custom workflows directory
 */
export function getWorkflowLoader(workflowsDir?: string,): WorkflowLoader {
  if (!_instance) {
    _instance = new WorkflowLoader(workflowsDir,);
  }
  return _instance;
}

/**
 * Convenience function: load and substitute a workflow in one call.
 *
 * @param name - Workflow name (e.g., "txt2img")
 * @param params - Generation parameters to substitute
 * @returns Ready-to-submit ComfyUI workflow
 */
export async function loadComfyUIWorkflow(
  name: string,
  params: {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    seed?: number;
    [key: string]: unknown;
  },
): Promise<ComfyUIWorkflow> {
  const loader = getWorkflowLoader();
  const vars = buildSubstitutionVars(params,);
  return loader.loadWorkflow({ name, vars, },);
}
