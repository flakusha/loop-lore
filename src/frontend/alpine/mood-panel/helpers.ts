// ── Mood Panel — pure helpers ──

export function moodToEmoji(mood: string,): string {
  switch (mood) {
    case "ecstatic": {
      return "😄";
    }
    case "happy": {
      return "😊";
    }
    case "neutral": {
      return "😐";
    }
    case "sad": {
      return "😢";
    }
    case "miserable": {
      return "😞";
    }
    default: {
      return "😐";
    }
  }
}

export function moodToLabel(mood: string,): string {
  switch (mood) {
    case "ecstatic": {
      return "Ecstatic";
    }
    case "happy": {
      return "Happy";
    }
    case "neutral": {
      return "Neutral";
    }
    case "sad": {
      return "Sad";
    }
    case "miserable": {
      return "Miserable";
    }
    default: {
      return "Unknown";
    }
  }
}

export function happinessColor(happiness: number,): string {
  if (happiness >= 80) { return "var(--accent-green,)"; }
  if (happiness >= 60) { return "var(--accent-blue,)"; }
  if (happiness >= 45) { return "var(--text-secondary,)"; }
  if (happiness >= 25) { return "var(--accent-yellow,)"; }
  return "var(--accent-red,)";
}
