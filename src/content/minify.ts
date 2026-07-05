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

  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\/\*[\s\S]*?\*\//g, "");

  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/^\s*[\r\n]/gm, "");

  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*{\s*/g, "{");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*}\s*/g, "}");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*:\s*/g, ":");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*;\s*/g, ";");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*,\s*/g, ",");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*>\s*/g, ">");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*\+\s*/g, "+");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s*~\s*/g, "~");

  result = result.replaceAll(';}', "}");

  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s{2,}/g, " ");

  result = result.trim();

  return result;
}
