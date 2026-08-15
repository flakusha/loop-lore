/** A memory option surfaced for a selected actor. */
export interface CharacterMemory {
  id: string;
  content: string;
  type: string;
  importance: number;
  pinned: boolean;
  tokens: number;
}

/** Shape of a chat setup template row. */
export interface ChatTemplateMeta {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: string | null;
  turnStrategy: string | null;
  worldId: string | null;
  gmConfig: Record<string, unknown> | null;
  visualNovel: boolean;
  /** Short display tags ("rpg mode", "vn mode", "no gm", ...). */
  features: string[];
  /** Chat visibility state the template seeds ("private" | "public" | "unlisted" | null). */
  visibility: string | null;
}

/**
 * Per-load mutable state for the New Chat page controller.
 *
 * A fresh context is created for every `loadNewChatPage` invocation so state
 * never leaks between successive htmx swaps of the create-chat form.
 */
export interface NewChatCtx {
  actors: any[];
  selected: any[];
  characterMemories: CharacterMemory[];
  selectedMemoryIds: Set<string>;
  templates: ChatTemplateMeta[];
  templateSelect: HTMLSelectElement | null;
  templateFeaturesGroup: HTMLElement | null;
  templateFeaturesList: HTMLElement | null;
  fineTuneGroup: HTMLElement | null;
  turnStrategySelect: HTMLSelectElement | null;
  visibilitySelect: HTMLSelectElement | null;
  visualNovelCheckbox: HTMLInputElement | null;
  searchInput: HTMLInputElement | null;
  resultsEl: HTMLElement | null;
  selectedEl: HTMLElement | null;
  chatType: HTMLSelectElement | null;
  form: HTMLFormElement | null;
  impersonateGroup: HTMLElement | null;
  impersonateToggle: HTMLInputElement | null;
  memoryCarryGroup: HTMLElement | null;
  memorySelectiveList: HTMLElement | null;
  memoryCheckboxList: HTMLElement | null;
  memoryCountLabel: HTMLElement | null;
  memoryTokenEstimate: HTMLElement | null;
  memoryTokenCount: HTMLElement | null;
  memorySelectAllBtn: HTMLButtonElement | null;
}

export function createCtx(): NewChatCtx {
  return {
    actors: [],
    selected: [],
    characterMemories: [],
    selectedMemoryIds: new Set(),
    templates: [],
    templateSelect: null,
    templateFeaturesGroup: null,
    templateFeaturesList: null,
    fineTuneGroup: null,
    turnStrategySelect: null,
    visibilitySelect: null,
    visualNovelCheckbox: null,
    searchInput: null,
    resultsEl: null,
    selectedEl: null,
    chatType: null,
    form: null,
    impersonateGroup: null,
    impersonateToggle: null,
    memoryCarryGroup: null,
    memorySelectiveList: null,
    memoryCheckboxList: null,
    memoryCountLabel: null,
    memoryTokenEstimate: null,
    memoryTokenCount: null,
    memorySelectAllBtn: null,
  };
}

export const isGroup = (ctx: NewChatCtx,): boolean => ctx.chatType?.value === "group";
