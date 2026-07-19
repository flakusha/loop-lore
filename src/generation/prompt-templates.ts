/**
 * Prompt Templates — Image model profiles & LLM prompt generation
 *
 * Maps image model families (SD1, SDXL, Krea2, Anima, etc.) to
 * their prompt format preferences and generation templates.
 *
 * Templates are used by the LLM to produce the final image prompt.
 * The "ignore previous instructions" pattern is intentional — the
 * LLM must switch from RPG chat mode to image description mode.
 */

// ── Model family classification ─────────────────────────────

export type ImageModelFamily =
  | "sd1"
  | "sd2"
  | "sdxl"
  | "illustrious"
  | "noob"
  | "pony"
  | "sd3"
  | "flux"
  | "krea2"
  | "anima"
  | "ideogram"
  | "qwen"
  | "chroma";

/** Prompt format the image model expects */
export type PromptFormat = "tags" | "natural" | "tags-and-natural" | "json";

/** Generation mode for SD prompt generation */
export type SdGenMode = "yourself" | "face" | "me" | "scene" | "last" | "raw_last" | "background" | "free";

/** Detail level: instant = fast/low-token, detailed = rich/high-token */
export type DetailLevel = "instant" | "balanced" | "detailed";

/** Per-model template overrides for each gen mode */
export interface ImageModelTemplates {
  yourself: string;
  face: string;
  me: string;
  scene: string;
  last: string;
  background: string;
}

/** Default generation parameters for a model profile */
export interface ModelDefaults {
  cfgScale: number;
  steps: number;
  sampler: string;
  scheduler?: string;
  clipSkip?: number;
}

/** Profile for one image model family */
export interface ImageModelProfile {
  id: string;
  name: string;
  families: ImageModelFamily[];
  promptFormat: PromptFormat;
  /** Recommended max tokens for the generated prompt */
  maxTokenHint: number;
  /** Default gen params */
  defaults: ModelDefaults;
  /** Prompt templates per gen mode, keyed by detail level */
  templates: Record<DetailLevel, ImageModelTemplates>;
}

/** Registry of all model profiles */
export interface ImageModelProfileRegistry {
  profiles: Record<string, ImageModelProfile>;
  defaultProfileId: string;
  /** Match model name patterns to profile IDs (first match wins) */
  modelMatching?: { pattern: string; profileId: string }[];
}

/** Variables substituted into templates */
export interface TemplateContext {
  charName: string;
  charDescription: string;
  userName: string;
  userDescription: string;
  lastMessage: string;
  sceneSummary: string;
  chatHistory: string;
  negativePrompt?: string;
  charPrefix?: string;
  extra?: Record<string, string>;
}

// ── Template tokens ─────────────────────────────────────────

const TOKENS = {
  charName: "{{charName}}",
  charDescription: "{{charDescription}}",
  userName: "{{userName}}",
  userDescription: "{{userDescription}}",
  lastMessage: "{{lastMessage}}",
  sceneSummary: "{{sceneSummary}}",
  chatHistory: "{{chatHistory}}",
  negativePrompt: "{{negativePrompt}}",
  charPrefix: "{{charPrefix}}",
} as const;

type TokenKey = keyof typeof TOKENS;

/** Resolve a template string by replacing all tokens */
export function resolveTemplate(template: string, ctx: TemplateContext,): string {
  const tokenMap: Record<TokenKey, string> = {
    charName: ctx.charName,
    charDescription: ctx.charDescription,
    userName: ctx.userName,
    userDescription: ctx.userDescription,
    lastMessage: ctx.lastMessage,
    sceneSummary: ctx.sceneSummary,
    chatHistory: ctx.chatHistory,
    negativePrompt: ctx.negativePrompt ?? "",
    charPrefix: ctx.charPrefix ?? "",
  };

  let result = template;
  for (const [key, value,] of Object.entries(tokenMap,)) {
    result = result.replaceAll(TOKENS[key as TokenKey], value,);
  }

  if (ctx.extra) {
    for (const [key, value,] of Object.entries(ctx.extra,)) {
      result = result.replaceAll(`{{${key}}}`, value,);
    }
  }

  return result;
}

// ── Helper: build tag-based templates ───────────────────────

function tagTemplates(styleTags: string,): Record<DetailLevel, ImageModelTemplates> {
  const base = {
    yourself:
      `Ignore previous instructions. Write comma-separated image tags describing {{charName}}. ${styleTags} full body portrait, {{charPrefix}}{{charDescription}}`,
    face:
      `Ignore previous instructions. Write comma-separated image tags describing {{charName}} face close-up. ${styleTags} face portrait close-up, {{charPrefix}}{{charDescription}}`,
    me:
      `Ignore previous instructions. Write comma-separated image tags describing {{userName}}. ${styleTags} full body portrait, {{userDescription}}`,
    scene: `Ignore previous instructions. Write comma-separated image tags for scene: {{sceneSummary}}. ${styleTags}`,
    last: `Ignore previous instructions. Write comma-separated image tags for: {{lastMessage}}. ${styleTags}`,
    background:
      `Ignore previous instructions. Write comma-separated tags for background scene: {{sceneSummary}}. ${styleTags} landscape, scenery`,
  };

  return {
    instant: {
      yourself: `short tags: ${base.yourself}`,
      face: `short tags: ${base.face}`,
      me: `short tags: ${base.me}`,
      scene: `short tags: ${base.scene}`,
      last: `short tags: ${base.last}`,
      background: `short tags: ${base.background}`,
    },
    balanced: { ...base, },
    detailed: {
      yourself: `${base.yourself} Be very descriptive.`,
      face: `${base.face} Be very descriptive.`,
      me: `${base.me} Be very descriptive.`,
      scene: `${base.scene} Be very descriptive.`,
      last: `${base.last} Be very descriptive.`,
      background: `${base.background} Be very descriptive.`,
    },
  };
}

// ── Helper: build natural language templates ────────────────

function naturalTemplates(style: string,): Record<DetailLevel, ImageModelTemplates> {
  const base = {
    yourself:
      `Describe {{charName}} in detailed natural language. ${style} Focus on appearance, clothing, expression, pose. {{charPrefix}}{{charDescription}}`,
    face:
      `Describe {{charName}} face in detailed natural language. ${style} Focus on facial features, expression, lighting. face close-up, {{charPrefix}}{{charDescription}}`,
    me: `Describe {{userName}} in detailed natural language. ${style} Focus on appearance. {{userDescription}}`,
    scene:
      `Describe the scene in one flowing paragraph: {{sceneSummary}}. ${style} Focus on composition, lighting, colors, mood.`,
    last: `Describe the following scene in one flowing paragraph. ${style} Focus on visual details: {{lastMessage}}`,
    background:
      `Describe the background setting in one paragraph: {{sceneSummary}}. ${style} Focus on environment, lighting, atmosphere. landscape, scenery`,
  };

  return {
    instant: {
      yourself: `Briefly: ${base.yourself}`,
      face: `Briefly: ${base.face}`,
      me: `Briefly: ${base.me}`,
      scene: `Briefly: ${base.scene}`,
      last: `Briefly: ${base.last}`,
      background: `Briefly: ${base.background}`,
    },
    balanced: { ...base, },
    detailed: {
      yourself: `Write a detailed paragraph describing ${base.yourself}`,
      face: `Write a detailed paragraph describing ${base.face}`,
      me: `Write a detailed paragraph describing ${base.me}`,
      scene: `Write a detailed paragraph. ${base.scene}`,
      last: `Write a detailed paragraph. ${base.last}`,
      background: `Write a detailed paragraph. ${base.background}`,
    },
  };
}

// ── Helper: build mixed tag+natural templates ───────────────

function mixedTagNaturalTemplates(style: string,): Record<DetailLevel, ImageModelTemplates> {
  const base = {
    yourself:
      `Describe {{charName}} using lowercase keywords with spaces. Mix tag-like keywords and natural language. ${style} Include: full body, {{charPrefix}}{{charDescription}}`,
    face:
      `Describe {{charName}} face using lowercase keywords with spaces. Mix tags and natural language. ${style} face close-up, {{charPrefix}}{{charDescription}}`,
    me:
      `Describe {{userName}} using lowercase keywords with spaces. Mix tags and natural language. {{userDescription}}`,
    scene: `Describe scene using lowercase keywords with spaces: {{sceneSummary}}. Mix tags and natural language.`,
    last: `Describe using lowercase keywords with spaces. Mix tags and natural language: {{lastMessage}}`,
    background: `Describe background using lowercase keywords with spaces: {{sceneSummary}}. landscape, scenery`,
  };

  return {
    instant: {
      yourself: `short: ${base.yourself}`,
      face: `short: ${base.face}`,
      me: `short: ${base.me}`,
      scene: `short: ${base.scene}`,
      last: `short: ${base.last}`,
      background: `short: ${base.background}`,
    },
    balanced: { ...base, },
    detailed: {
      yourself: `${base.yourself} Be very descriptive.`,
      face: `${base.face} Be very descriptive.`,
      me: `${base.me} Be very descriptive.`,
      scene: `${base.scene} Be very descriptive.`,
      last: `${base.last} Be very descriptive.`,
      background: `${base.background} Be very descriptive.`,
    },
  };
}

// ── Built-in profile registry ────────────────────────────────

const TAG_STYLE = "best quality, masterpiece, highres";
const NATURAL_STYLE = "highly detailed, cinematic lighting, professional photography";
const ANIME_STYLE = "best quality, masterpiece, anime style, vibrant colors";

export const BUILTIN_PROFILES: Record<string, ImageModelProfile> = {
  sd1: {
    id: "sd1",
    name: "Stable Diffusion 1.x/2.x",
    families: ["sd1", "sd2",],
    promptFormat: "tags",
    maxTokenHint: 75,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates(TAG_STYLE,),
  },

  sdxl: {
    id: "sdxl",
    name: "SDXL",
    families: ["sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 7, steps: 28, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates(TAG_STYLE,),
  },

  illustrious: {
    id: "illustrious",
    name: "Illustrious (Danbooru tags)",
    families: ["illustrious", "sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 5, steps: 28, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates("masterpiece, best quality, highres",),
  },

  noob: {
    id: "noob",
    name: "NoobAI (Danbooru+E621 tags)",
    families: ["noob", "sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 5, steps: 28, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates("masterpiece, best quality, highres",),
  },

  pony: {
    id: "pony",
    name: "Pony (score tags)",
    families: ["pony", "sdxl",],
    promptFormat: "tags",
    maxTokenHint: 150,
    defaults: { cfgScale: 7.5, steps: 30, sampler: "euler_a", scheduler: "karras", },
    templates: tagTemplates("score_9, score_8_up, score_7_up, score_6_up, score_5_up",),
  },

  sd3: {
    id: "sd3",
    name: "Stable Diffusion 3/3.5",
    families: ["sd3",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 28, sampler: "dpmpp_2m", scheduler: "karras", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },

  flux: {
    id: "flux",
    name: "FLUX (dev/schnell/klein)",
    families: ["flux",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler", scheduler: "default", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },

  krea2: {
    id: "krea2",
    name: "Krea 2",
    families: ["krea2",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 12, sampler: "euler", scheduler: "default", },
    templates: {
      instant: {
        yourself: `Describe {{charName}} briefly. {{charPrefix}}{{charDescription}}`,
        face: `Describe {{charName}} face briefly. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Describe {{userName}} briefly. {{userDescription}}`,
        scene: `Brief scene: {{sceneSummary}}`,
        last: `Brief: {{lastMessage}}`,
        background: `Brief background: {{sceneSummary}}. landscape, scenery`,
      },
      balanced: {
        yourself:
          `Describe {{charName}} in one flowing paragraph. Focus on visual details, lighting, composition. full body portrait, {{charPrefix}}{{charDescription}}`,
        face:
          `Describe {{charName}} face in one paragraph. Focus on features, expression, lighting. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Describe {{userName}} in one paragraph. Focus on appearance. {{userDescription}}`,
        scene:
          `Describe the scene in one flowing paragraph. Focus on composition, lighting, colors, mood: {{sceneSummary}}`,
        last: `Describe in one flowing paragraph. Focus on visual details: {{lastMessage}}`,
        background: `Describe background in one paragraph: {{sceneSummary}}. landscape, scenery, environment`,
      },
      detailed: {
        yourself:
          `Write a detailed paragraph describing {{charName}}. Include appearance, clothing, expression, pose, lighting. full body portrait, {{charPrefix}}{{charDescription}}`,
        face:
          `Write a detailed paragraph describing {{charName}} face. Include facial features, expression, skin texture, eye color, lighting. face close-up, {{charPrefix}}{{charDescription}}`,
        me:
          `Write a detailed paragraph describing {{userName}}. Include appearance, clothing, pose. {{userDescription}}`,
        scene:
          `Write a detailed paragraph describing the scene. Include composition, lighting, color palette, mood, atmosphere, camera angle: {{sceneSummary}}`,
        last: `Write a detailed paragraph. Include visual details, lighting, composition, mood: {{lastMessage}}`,
        background:
          `Write a detailed paragraph describing the background. Environment, lighting, time of day, atmosphere: {{sceneSummary}}`,
      },
    },
  },

  anima: {
    id: "anima",
    name: "Anima (tags + natural language)",
    families: ["anima",],
    promptFormat: "tags-and-natural",
    maxTokenHint: 150,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler_a", scheduler: "karras", },
    templates: mixedTagNaturalTemplates(ANIME_STYLE,),
  },

  ideogram: {
    id: "ideogram",
    name: "Ideogram 4 (JSON captions)",
    families: ["ideogram",],
    promptFormat: "json",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 30, sampler: "dpmpp_2m", scheduler: "karras", },
    templates: {
      instant: {
        yourself:
          `Output JSON: {"high_level_description": "{{charName}}", "style_description": {"style": "portrait"}, "compositional_deconstruction": {"foreground": ["{{charDescription}}"]}}`,
        face:
          `Output JSON: {"high_level_description": "{{charName}} face", "style_description": {"style": "portrait"}, "compositional_deconstruction": {"foreground": ["{{charDescription}} face close-up"]}}`,
        me:
          `Output JSON: {"high_level_description": "{{userName}}", "style_description": {"style": "portrait"}, "compositional_deconstruction": {"foreground": ["{{userDescription}}"]}}`,
        scene: `Output JSON describing the scene: {{sceneSummary}}`,
        last: `Output JSON describing: {{lastMessage}}`,
        background: `Output JSON for background: {{sceneSummary}}`,
      },
      balanced: {
        yourself: `Output JSON with detailed composition for {{charName}}. {{charDescription}}`,
        face:
          `Output JSON with detailed composition for {{charName}} face. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Output JSON with detailed composition for {{userName}}. {{userDescription}}`,
        scene: `Output JSON describing scene composition: {{sceneSummary}}`,
        last: `Output JSON describing composition: {{lastMessage}}`,
        background: `Output JSON for background: {{sceneSummary}}`,
      },
      detailed: {
        yourself:
          `Output detailed JSON with full compositional_deconstruction for {{charName}}. Include foreground, background, lighting, color palette. full body portrait, {{charPrefix}}{{charDescription}}`,
        face:
          `Output detailed JSON with full compositional_deconstruction for {{charName}} face. face close-up, {{charPrefix}}{{charDescription}}`,
        me: `Output detailed JSON with full composition for {{userName}}. {{userDescription}}`,
        scene: `Output detailed JSON with full compositional_deconstruction for scene: {{sceneSummary}}`,
        last: `Output detailed JSON with full composition for: {{lastMessage}}`,
        background: `Output detailed JSON for background: {{sceneSummary}}`,
      },
    },
  },

  qwen: {
    id: "qwen",
    name: "Qwen Image 2.0",
    families: ["qwen",],
    promptFormat: "natural",
    maxTokenHint: 1000,
    defaults: { cfgScale: 7, steps: 28, sampler: "dpmpp_2m", scheduler: "karras", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },

  chroma: {
    id: "chroma",
    name: "Chroma",
    families: ["chroma",],
    promptFormat: "natural",
    maxTokenHint: 300,
    defaults: { cfgScale: 7, steps: 25, sampler: "euler", scheduler: "default", },
    templates: naturalTemplates(NATURAL_STYLE,),
  },
};

// ── Default registry ────────────────────────────────────────

export const DEFAULT_PROFILE_REGISTRY: ImageModelProfileRegistry = {
  profiles: BUILTIN_PROFILES,
  defaultProfileId: "sdxl",
  modelMatching: [
    { pattern: "illustrious", profileId: "illustrious", },
    { pattern: "noobai", profileId: "noob", },
    { pattern: "noob", profileId: "noob", },
    { pattern: "pony", profileId: "pony", },
    { pattern: "sd1", profileId: "sd1", },
    { pattern: "sd2", profileId: "sd1", },
    { pattern: "sd3", profileId: "sd3", },
    { pattern: "sd3.5", profileId: "sd3", },
    { pattern: "flux", profileId: "flux", },
    { pattern: "krea", profileId: "krea2", },
    { pattern: "anima", profileId: "anima", },
    { pattern: "ideogram", profileId: "ideogram", },
    { pattern: "qwen", profileId: "qwen", },
    { pattern: "chroma", profileId: "chroma", },
    { pattern: "sdxl", profileId: "sdxl", },
  ],
};

// ── Resolver ────────────────────────────────────────────────

export interface ResolveProfileOptions {
  /** Model name string (e.g. "flux1-dev", "ponyDiffusionV6") */
  modelName?: string;
  /** Registry override (uses DEFAULT_PROFILE_REGISTRY if omitted) */
  registry?: ImageModelProfileRegistry;
  /** Explicit profile ID override */
  profileId?: string;
}

export interface ResolvedProfile {
  profile: ImageModelProfile;
  /** The template string for the given mode and detail level */
  template: string;
  /** The resolved model ID (profile.id) */
  resolvedProfileId: string;
}

/**
 * Resolve an image model profile by model name, profile ID, or default.
 * Returns the profile + the correct template for the given mode + detail.
 */
export function resolveProfile(
  mode: SdGenMode,
  detail: DetailLevel,
  opts: ResolveProfileOptions = {},
): ResolvedProfile {
  const registry = opts.registry ?? DEFAULT_PROFILE_REGISTRY;
  const profiles = registry.profiles;

  let profileId = opts.profileId;

  if (!profileId && opts.modelName && registry.modelMatching) {
    const lower = opts.modelName.toLowerCase();
    for (const rule of registry.modelMatching) {
      if (lower.includes(rule.pattern,)) {
        profileId = rule.profileId;
        break;
      }
    }
  }

  if (!profileId || !profiles[profileId]) {
    profileId = registry.defaultProfileId;
  }

  const profile = profiles[profileId]!;

  const modeKey = mode === "raw_last" ? "last" : mode;
  const modeTemplates = profile.templates[detail] ?? profile.templates.balanced;
  const fallbackMode = modeKey === "free" ? "last" : modeKey;
  const template = modeTemplates[fallbackMode] ?? modeTemplates.yourself;

  return { profile, template, resolvedProfileId: profileId, };
}

/**
 * Generate the full prompt by resolving the template and filling in context.
 * Shorthand: resolve + resolveTemplate in one call.
 */
export function generatePrompt(
  mode: SdGenMode,
  detail: DetailLevel,
  ctx: TemplateContext,
  opts: ResolveProfileOptions = {},
): { prompt: string; profile: ImageModelProfile; resolvedProfileId: string } {
  const { profile, template, resolvedProfileId, } = resolveProfile(mode, detail, opts,);
  return {
    prompt: resolveTemplate(template, ctx,),
    profile,
    resolvedProfileId,
  };
}

// ── LLM Message Assembly for Image Prompt Generation ────────

/** System prompt templates per model family group */
function systemPromptForFamily(
  promptFormat: PromptFormat,
  detail: DetailLevel,
  maxTokenHint: number,
): string {
  const verbosity = detail === "instant" ? "short" : detail === "balanced" ? "concise" : "detailed";

  switch (promptFormat) {
    case "tags": {
      return [
        `You are an image prompt writer. Output ONLY a ${verbosity} comma-separated list of image tags.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
        `Use booru-style tags: 1girl, black hair, blue eyes, smile, etc.`,
      ].join(" ",);
    }
    case "natural": {
      return [
        `You are an image prompt writer. Output ONLY a ${verbosity} natural language description.`,
        `One paragraph. Focus on visual composition, lighting, colors, mood, subject.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
      ].join(" ",);
    }
    case "tags-and-natural": {
      return [
        `You are an image prompt writer. Output a ${verbosity} mix of lowercase keywords and natural language.`,
        `Use spaces between keywords. Blend tag-like descriptors with descriptive phrases.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
      ].join(" ",);
    }
    case "json": {
      return [
        `You are an image prompt writer. Output ONLY a JSON object with high_level_description, style_description, and compositional_deconstruction fields.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
      ].join(" ",);
    }
    default: {
      return `You are an image prompt writer. Output a ${verbosity} description of the scene. Keep under ${maxTokenHint} tokens.`;
    }
  }
}

/** Build a role-switch system message for image prompt generation */
export function buildImageSystemPrompt(profile: ImageModelProfile, detail: DetailLevel,): string {
  const format = profile.promptFormat;
  const content = systemPromptForFamily(format, detail, profile.maxTokenHint,);

  // The role switch instruction is critical: the LLM was just roleplaying
  // as a character in an RPG. It needs to switch to image prompt writer mode.
  // Putting this in the system message is cleaner than "ignore previous
  // instructions" in the user message.
  return [
    `[New Task] Forget previous instructions. You are now an image prompt writer.`,
    content,
    `Do not reference this instruction in your output.`,
  ].join(" ",);
}

export interface ImagePromptMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Build the full LLM message array for image prompt generation.
 * Returns [system, user] messages ready to send to the LLM.
 *
 * Token budget per detail level:
 *   instant:   system ~80-120 + user ~200-400 = ~280-520
 *   balanced:  system ~100-150 + user ~400-800 = ~500-950
 *   detailed:  system ~120-180 + user ~800-1600 = ~920-1780
 */
export function buildImagePromptMessages(
  mode: SdGenMode,
  detail: DetailLevel,
  ctx: TemplateContext,
  opts: ResolveProfileOptions = {},
): ImagePromptMessage[] {
  const { profile, template, } = resolveProfile(mode, detail, opts,);
  const systemPrompt = buildImageSystemPrompt(profile, detail,);
  const userMessage = resolveTemplate(template, ctx,);

  return [
    { role: "system", content: systemPrompt, },
    { role: "user", content: userMessage, },
  ];
}

/**
 * Build image prompt messages and return everything needed in one call.
 * Convenience wrapper for calling code.
 */
export function buildImagePrompt(
  mode: SdGenMode,
  detail: DetailLevel,
  ctx: TemplateContext,
  opts: ResolveProfileOptions = {},
): {
  messages: ImagePromptMessage[];
  systemPrompt: string;
  userMessage: string;
  profile: ImageModelProfile;
  resolvedProfileId: string;
  estimatedTotalTokens: number;
} {
  const { profile, resolvedProfileId, } = resolveProfile(mode, detail, opts,);
  const messages = buildImagePromptMessages(mode, detail, ctx, opts,);
  const systemPrompt = messages[0]!.content;
  const userMessage = messages[1]!.content;
  const estimatedTotalTokens = systemPrompt.split(/\s+/,).length + userMessage.split(/\s+/,).length;

  return {
    messages,
    systemPrompt,
    userMessage,
    profile,
    resolvedProfileId,
    estimatedTotalTokens,
  };
}
