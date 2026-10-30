// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/object_info` spec → `TemplateParameter` type mapping.
 *
 * INT/FLOAT map to `number` (min/max/step when the spec carries them);
 * BOOLEAN to `boolean`; STRING to `string`; a COMBO with a static option
 * list to `select` (SOURCE `static`); a folder-backed COMBO — models, clips,
 * VAEs, upscalers, watermark paths — to `string` with SOURCE `runtime`
 * (options arrive from live discovery, the LoRA-ticket cache pattern); an
 * IMAGE socket to `image`, riding the asset-id upload path. The default is
 * always the workflow's own current widget value.
 *
 * @module comfyui-params/type-map
 */
import type { TemplateParameter, } from "../../image-edit/types";
import { brand, } from "../../utils/brands";
import { lookupClass, } from "../comfyui-converter/object-info";
import type { ObjectInfoClass, ObjectInfoSnapshot, } from "../comfyui-converter/types";
import type { MarkedInput, } from "./marks";
import type { DerivedParameter, OptionSource, ParameterName, } from "./types";

/** Input for {@link mapSpecToParam}. */
export interface TypeMappingInput {
  readonly marked: MarkedInput;
  readonly snapshot: ObjectInfoSnapshot;
}

/** Folder-backed combo names: unbounded, resolved at runtime. */
const RUNTIME_COMBO_PATTERNS: readonly RegExp[] = [
  /ckpt/i,
  /model_name/i,
  /unet/i,
  /clip_name/i,
  /vae/i,
  /lora/i,
  /upscale/i,
  /watermark/i,
  /^image$/i,
];

function isRuntimeCombo(inputName: string,): boolean {
  return RUNTIME_COMBO_PATTERNS.some((pattern,) => pattern.test(inputName,));
}

function specOf(info: ObjectInfoClass | undefined, name: string,): readonly unknown[] | undefined {
  return info?.input?.required?.[name] ?? info?.input?.optional?.[name];
}

function tagOf(spec: readonly unknown[] | undefined,): string {
  if (spec === undefined || spec.length === 0) { return "?"; }
  const first = spec[0];
  if (typeof first === "string") { return first; }
  if (Array.isArray(first,)) { return "COMBO"; }
  return "?";
}

interface Bounds {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

function boundsOf(spec: readonly unknown[] | undefined,): Bounds {
  if (spec === undefined || spec.length < 2) { return {}; }
  const opts = spec[1];
  if (typeof opts !== "object" || opts === null || Array.isArray(opts,)) { return {}; }
  const record = opts as Readonly<Record<string, unknown>>;
  const pick = (key: string,): number | undefined => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value,) ? value : undefined;
  };

  const min = pick("min",);
  const max = pick("max",);
  const step = pick("step",);
  return {
    ...(min === undefined ? {} : { min, }),
    ...(max === undefined ? {} : { max, }),
    ...(step === undefined ? {} : { step, }),
  };
}

function staticOptions(spec: readonly unknown[] | undefined,): Array<{ label: string; value: unknown }> | null {
  if (spec === undefined || spec.length === 0) { return null; }
  const first = spec[0];
  if (!Array.isArray(first,)) { return null; }
  return first.map((option,) => ({ label: String(option,), value: option, }));
}

function slugify(label: string | null, fallback: string,): string {
  const base = (label ?? fallback).toLowerCase().replaceAll(/[^a-z0-9]+/g, "_",).replaceAll(/^_+|_+$/g, "",);
  return base === "" ? fallback : base;
}

function paramName(marked: MarkedInput, taken: ReadonlySet<string>,): ParameterName {
  const base = slugify(marked.label, marked.inputName,);
  if (!taken.has(base,)) { return brand<"ComfyParamName">(base,); }
  let index = 2;
  while (taken.has(`${base}_${String(index,)}`,)) { index += 1; }
  return brand<"ComfyParamName">(`${base}_${String(index,)}`,);
}

/**
 * Map one marked input to its row parameter via the snapshot spec.
 * @param input - Marked input plus the pinned snapshot
 * @param taken - Parameter names already claimed (suffixes on collision)
 * @returns The derived parameter, or null when the socket is not parameterizable
 */
export function mapSpecToParam(input: TypeMappingInput, taken: ReadonlySet<string>,): DerivedParameter | null {
  const { marked, snapshot, } = input;
  const info = marked.className.startsWith("subgraph:",) ? undefined : lookupClass(snapshot, marked.className,);
  const spec = info === undefined ? undefined : specOf(info, marked.inputName,);
  const socketTag = marked.socketType.split(",",)[0]?.trim() ?? "?";
  const tag = spec === undefined ? socketTag : tagOf(spec,);
  const name = paramName(marked, taken,);
  const label = marked.label ?? marked.inputName;
  const fallback = { name, label, default: marked.defaultValue ?? "", } as const;
  let parameter: TemplateParameter;
  let optionSource: OptionSource | null = null;
  switch (tag) {
    case "INT":
    case "FLOAT":
    case "NUMBER": {
      const bounds = boundsOf(spec,);
      const raw = marked.defaultValue;
      parameter = {
        ...fallback,
        type: "number",
        default: typeof raw === "number" ? raw : 0,
        ...bounds,
      };

      break;
    }

    case "BOOLEAN": {
      parameter = {
        ...fallback,
        type: "boolean",
        default: typeof marked.defaultValue === "boolean" ? marked.defaultValue : false,
      };

      break;
    }

    case "COMBO": {
      if (socketTag === "IMAGE") {
        parameter = { ...fallback, type: "image", default: "", };
        break;
      }

      if (isRuntimeCombo(marked.inputName,)) {
        optionSource = "runtime";
        parameter = {
          ...fallback,
          type: "string",
          default: typeof marked.defaultValue === "string" ? marked.defaultValue : "",
        };

        break;
      }

      const options = staticOptions(spec,);
      if (options !== null) {
        optionSource = "static";
        parameter = {
          ...fallback,
          type: "select",
          default: marked.defaultValue ?? options[0]?.value ?? "",
          options,
        };

        break;
      }

      optionSource = "runtime";
      parameter = {
        ...fallback,
        type: "string",
        default: typeof marked.defaultValue === "string" ? marked.defaultValue : "",
      };

      break;
    }

    case "IMAGE": {
      if (socketTag === "IMAGE") {
        parameter = { ...fallback, type: "image", default: "", };
        break;
      }

      optionSource = "runtime";
      parameter = {
        ...fallback,
        type: "string",
        default: typeof marked.defaultValue === "string" ? marked.defaultValue : "",
      };

      break;
    }

    case "STRING": {
      parameter = {
        ...fallback,
        type: "string",
        default: typeof marked.defaultValue === "string" ? marked.defaultValue : "",
      };

      break;
    }

    default: {
      return null;
    }
  }

  return { parameter, optionSource, };
}
