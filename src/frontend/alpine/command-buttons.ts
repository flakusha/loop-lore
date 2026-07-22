/**
 * Command Buttons (Epic 42)
 *
 * Alpine.js component for command button toolbar.
 * Provides quick access to assistant commands via button clicks
 * instead of typing slash commands.
 */

interface CommandButton {
  name: string;
  label: string;
  icon: string;
  description: string;
}

const COMMAND_BUTTONS: CommandButton[] = [
  { name: "image", label: "Image", icon: "🎨", description: "Generate image", },
  { name: "video", label: "Video", icon: "🎬", description: "Generate video", },
  { name: "sfx", label: "SFX", icon: "🔊", description: "Generate sound effect", },
  { name: "music", label: "Music", icon: "🎵", description: "Generate or link music", },
  { name: "caption", label: "Caption", icon: "🏷️", description: "Caption image", },
  { name: "improve", label: "Improve", icon: "✨", description: "Improve last message", },
  { name: "quest", label: "Quest", icon: "📜", description: "Manage quests", },
  { name: "roll", label: "Roll", icon: "🎲", description: "Roll dice", },
];

(globalThis as unknown as Record<string, unknown>).commandButtons = function() {
  return {
    buttons: COMMAND_BUTTONS,
    showLabels: localStorage.getItem("command-button-labels",) === "1",

    /** Run a command by inserting it into the message input */
    runCommand(cmd: string,): void {
      const input = document.querySelector("#message-input",) as HTMLTextAreaElement | null;
      if (input) {
        input.value = `/${cmd} `;
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true, },),);
      }
    },

    /** Toggle button labels visibility */
    toggleLabels(): void {
      this.showLabels = !this.showLabels;
      localStorage.setItem("command-button-labels", this.showLabels ? "1" : "0",);
    },
  };
};
