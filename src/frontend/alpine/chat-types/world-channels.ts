// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { WorldChannelChat, } from "./world";
/** World channel sidebar state (chat-only worlds) — sidebar tree. */
export interface ChatWorldChannelsState {
  _worlds: { id: string; name: string }[];
  _worldChats: Record<string, WorldChannelChat[]>;
  _worldExpanded: Record<string, boolean>;
  _worldsLoading: boolean;
  worldJoinCode: string;
  loadWorldChannels(): Promise<void>;
  loadWorldChats(worldId: string,): Promise<void>;
  toggleWorld(worldId: string,): void;
  worldChatGroups(worldId: string,): { locationId: string; locationName: string; chats: WorldChannelChat[] }[];
  joinWorldByCode(): Promise<void>;
  _joinableChats: { chatId: string; chatName: string; participantCount: number; lastActiveAt: string | null }[];
  loadJoinableChats(): Promise<void>;
  joinChat(chatId: string,): Promise<void>;
  /** Chat invite rows for the active chat (GET /api/v1/chats/:id/invites { data }). */
  _chatInvites: ChatInviteRow[];
  _chatInvitesLoading: boolean;
  _chatInvitesLoaded: boolean;
  _newChatInviteMaxUses: string;
  _showChatInviteForm: boolean;
  /** Redeem-code input in the sidebar (POST /api/v1/invites/:code/join). */
  _chatJoinCode: string;
  loadChatInvites(): Promise<void>;
  createChatInvite(): Promise<void>;
  copyChatInviteCode(code: string,): Promise<void>;
  revokeChatInvite(inviteId: string,): Promise<void>;
  joinChatByCode(): Promise<void>;
}

/** One chat invite row (mirrors InviteSchema in src/validation/schemas/invites.ts). */
export interface ChatInviteRow {
  id: string;
  chatId: string;
  code: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revoked: boolean;
}
