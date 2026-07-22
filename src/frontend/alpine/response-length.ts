/**
 * Response Length Control (FEAT-071)
 *
 * Alpine.js component for preset response length control.
 * Users can set Short, Medium, Long, or Custom presets that
 * influence the max_tokens parameter passed to the LLM.
 */

const LENGTH_PRESETS = [
  { value: "short", label: "Short (50–150 tokens)", maxTokens: 150, },
  { value: "medium", label: "Medium (150–400 tokens)", maxTokens: 400, },
  { value: "long", label: "Long (400–1000 tokens)", maxTokens: 1000, },
  { value: "custom", label: "Custom", maxTokens: 0, },
] as const;

(globalThis as unknown as Record<string, unknown>).responseLength = function() {
  return {
    preset: localStorage.getItem("response-length-preset",) || "medium",
    customMin: 0,
    customMax: 400,
    showCustom: false,

    /** Available presets for the dropdown */
    presets: LENGTH_PRESETS,

    /** Computed max_tokens from the current preset */
    get maxTokens(): number {
      if (this.preset === "custom") {
        return Math.max(1, this.customMax,);
      }
      const preset = LENGTH_PRESETS.find((p,) => p.value === this.preset);
      return preset ? preset.maxTokens : 400;
    },

    /** Label for the current preset */
    get label(): string {
      const preset = LENGTH_PRESETS.find((p,) => p.value === this.preset);
      return preset ? preset.label : "Medium";
    },

    /** Toggle custom preset inputs */
    toggleCustom(): void {
      this.showCustom = this.preset === "custom";
    },

    /** Set the preset and persist to localStorage */
    setPreset(value: string,): void {
      this.preset = value;
      this.showCustom = value === "custom";
      localStorage.setItem("response-length-preset", value,);
    },

    /** Save custom min/max values */
    saveCustom(): void {
      localStorage.setItem("response-length-custom-min", String(this.customMin,),);
      localStorage.setItem("response-length-custom-max", String(this.customMax,),);
    },

    /** Load saved settings from localStorage */
    load(): void {
      const savedPreset = localStorage.getItem("response-length-preset",);
      if (savedPreset) { this.preset = savedPreset; }
      const savedMin = localStorage.getItem("response-length-custom-min",);
      if (savedMin) { this.customMin = parseInt(savedMin, 10,); }
      const savedMax = localStorage.getItem("response-length-custom-max",);
      if (savedMax) { this.customMax = parseInt(savedMax, 10,); }
      this.showCustom = this.preset === "custom";
    },
  };
};
