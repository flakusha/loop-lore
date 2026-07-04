export function minifyText(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let isPreviousBlank = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed === "") {
      if (!isPreviousBlank) {
        result.push("");
        isPreviousBlank = true;
      }
    } else {
      result.push(trimmed);
      isPreviousBlank = false;
    }
  }

  return result.join("\n");
}

export function minifyCSS(content: string): string {
  let result = content;

  result = result.replace(/\/\*[\s\S]*?\*\//g, "");

  result = result.replace(/^\s*[\r\n]/gm, "");

  result = result.replace(/\s*{\s*/g, "{");
  result = result.replace(/\s*}\s*/g, "}");
  result = result.replace(/\s*:\s*/g, ":");
  result = result.replace(/\s*;\s*/g, ";");
  result = result.replace(/\s*,\s*/g, ",");
  result = result.replace(/\s*>\s*/g, ">");
  result = result.replace(/\s*\+\s*/g, "+");
  result = result.replace(/\s*~\s*/g, "~");

  result = result.replace(/;}/g, "}");

  result = result.replace(/\s{2,}/g, " ");

  result = result.trim();

  return result;
}
