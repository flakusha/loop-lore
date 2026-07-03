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
