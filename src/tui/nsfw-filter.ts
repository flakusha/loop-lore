/**
 * NSFW Content Filter for TUI
 *
 * Filters NSFW content based on user preferences and age gate status.
 * Applied to messages before display in the TUI interface.
 */

/** Filter modes for NSFW content. */
export type NsfwFilterMode = "show" | "blur" | "hide" | "fade_to_black";

/** Filter configuration. */
export interface NsfwFilterConfig {
  /** How to handle NSFW content. */
  mode: NsfwFilterMode;
  /** Content ratings that trigger filtering. */
  triggerRatings: string[];
  /** Keywords that indicate NSFW content. */
  keywords: string[];
}

/** Default filter configuration. */
const DEFAULT_CONFIG: NsfwFilterConfig = {
  mode: "show",
  triggerRatings: ["nsfw_mild", "nsfw_moderate", "nsfw_intense", "nsfw_extreme",],
  keywords: [
    "nude",
    "naked",
    "sex",
    "sexual",
    "intimate",
    "arousal",
    "orgasm",
    "penetration",
    "foreplay",
    "seduction",
  ],
};

/** NSFW content filter. */
export class NsfwFilter {
  private config: NsfwFilterConfig;

  constructor(config?: Partial<NsfwFilterConfig>,) {
    this.config = { ...DEFAULT_CONFIG, ...config, };
  }

  /**
   * Check if a message contains NSFW content.
   */
  isNsfw(content: string, contentRating?: string,): boolean {
    // Check content rating
    if (contentRating && this.config.triggerRatings.includes(contentRating,)) {
      return true;
    }

    // Check for NSFW keywords
    const lower = content.toLowerCase();
    for (const kw of this.config.keywords) {
      if (lower.includes(kw,)) { return true; }
    }
    return false;
  }

  /**
   * Filter a message based on NSFW content.
   *
   * Returns the filtered content or null if hidden.
   */
  filter(content: string, contentRating?: string,): string | null {
    if (!this.isNsfw(content, contentRating,)) {
      return content;
    }

    switch (this.config.mode) {
      case "show": {
        return content;
      }

      case "blur": {
        return "[NSFW Content Hidden]";
      }

      case "hide": {
        return null;
      }

      case "fade_to_black": {
        return "[The scene fades to black...]";
      }

      default: {
        return content;
      }
    }
  }

  /**
   * Get the current filter mode.
   */
  getMode(): NsfwFilterMode {
    return this.config.mode;
  }

  /**
   * Set the filter mode.
   */
  setMode(mode: NsfwFilterMode,): void {
    this.config.mode = mode;
  }

  /**
   * Add a keyword to the filter list.
   */
  addKeyword(keyword: string,): void {
    if (!this.config.keywords.includes(keyword,)) {
      this.config.keywords.push(keyword,);
    }
  }

  /**
   * Remove a keyword from the filter list.
   */
  removeKeyword(keyword: string,): void {
    const filtered: string[] = [];
    for (const kw of this.config.keywords) {
      if (kw !== keyword) { filtered.push(kw,); }
    }
    this.config.keywords = filtered;
  }
}
