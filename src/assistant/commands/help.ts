import { listCommands, registerCommand, } from "./registry";

registerCommand("help", () => {
  const cmds = listCommands();
  const lines = [
    "**Available Commands:**",
    "",
    ...Array.from(cmds, (c,) => `- \`/${c}\``,),
    "",
    "Type `/<command>` to execute. Use arrow keys or click to select from the palette.",
  ];
  return { systemMessage: lines.join("\n",), handled: true, };
},);
