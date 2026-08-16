// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "../types";
import { chatUtilsGallery, } from "./gallery";
import { chatUtilsGroupedData, computeGroupedMessages, } from "./grouped";
import { chatUtilsInteraction, } from "./interaction";
import { chatUtilsRender, } from "./render";
import { chatUtilsTime, } from "./time";

export { initAnonymousModeCheck, isAnonymousMode, } from "./anonymous";

export const chatUtils: Partial<ChatState> & ThisType<ChatState> = {
  ...chatUtilsTime,
  ...chatUtilsRender,
  ...chatUtilsInteraction,
  ...chatUtilsGallery,
  ...chatUtilsGroupedData,
  get groupedMessages() {
    return computeGroupedMessages.call(this,);
  },
};
