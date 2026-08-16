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
}
