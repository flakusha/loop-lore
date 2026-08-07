import { formattedGenerationTime, formattedTokensPerSecond, statsLine, } from "../chat-stats";
import type { ChatState, } from "../types";
import { commandPalette, } from "./command-palette";
import { dispatch, } from "./dispatch";
import { impersonation, } from "./impersonation";
import { media, } from "./media";

export const chatActions: Partial<ChatState> & ThisType<ChatState> = {
  ...commandPalette,
  ...dispatch,
  ...impersonation,
  ...media,
  formattedGenerationTime,
  formattedTokensPerSecond,
  statsLine,
};
