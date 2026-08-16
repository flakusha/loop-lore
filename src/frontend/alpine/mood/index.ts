// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "./../types";
import { moodStateAvatars, } from "./avatars";
import { moodStateEmotions, } from "./emotions";
import { moodStateLoading, } from "./loading";
import { moodStateProps, } from "./state";

export const moodState: Partial<ChatState> & ThisType<ChatState> = {
  ...moodStateProps,
  ...moodStateLoading,
  ...moodStateAvatars,
  ...moodStateEmotions,
};
