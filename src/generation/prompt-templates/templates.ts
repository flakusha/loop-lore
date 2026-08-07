import type {
  DetailLevel,
  ImageModelTemplates,
  TemplateContext,
} from "./types";

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
    result = result.replaceAll(TOKENS[key as TokenKey], () => value,);
  }

  if (ctx.extra) {
    for (const [key, value,] of Object.entries(ctx.extra,)) {
      result = result.replaceAll(`{{${key}}}`, () => value,);
    }
  }

  return result;
}

// ── Helper: build tag-based templates ───────────────────────

export function tagTemplates(styleTags: string,): Record<DetailLevel, ImageModelTemplates> {
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

export function naturalTemplates(style: string,): Record<DetailLevel, ImageModelTemplates> {
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

export function mixedTagNaturalTemplates(style: string,): Record<DetailLevel, ImageModelTemplates> {
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
