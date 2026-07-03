export function minifyText(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let prevBlank = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed === "") {
      if (!prevBlank) {
        result.push("");
        prevBlank = true;
      }
    } else {
      result.push(trimmed);
      prevBlank = false;
    }
  }

  return result.join("\n");
}
