import { registerCommand, listCommands } from "./registry";

registerCommand("help", () => {
  const cmds = listCommands();
  const lines = [
    "**Available Commands:**",
    "",
    ...cmds.map((c) => `- \`/${c}\``),
    "",
    "Type `/<command>` to execute. Use arrow keys or click to select from the palette.",
  ];
  return { systemMessage: lines.join("\n"), handled: true };
});
