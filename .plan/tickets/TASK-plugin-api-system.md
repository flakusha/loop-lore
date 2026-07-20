# TASK: Plugin API System

**Epic:** Plugin System & Extensibility
**Priority:** High
**Effort:** Very High
**Status:** Not Started

## Summary

Implement comprehensive plugin API providing access to all system functionality (chat, RPG, world, battle, trading, state) through TypeScript/JavaScript API, REST API, WebSocket API, and CLI API.

## Core Features

### Core APIs
- Chat API (messages, conversations, participants)
- RPG API (characters, skills, dice, inventory)
- World API (locations, NPCs, items, events)
- Battle API (battles, turns, actions, damage)
- Trading API (trades, offers, inventory)
- State API (state management, persistence)

### System APIs
- Database API (queries, transactions, migrations)
- Filesystem API (files, directories, streams)
- Network API (HTTP, WebSocket, TCP, UDP)
- Crypto API (encryption, hashing, signing)

### Utility APIs
- Logger API (logging, monitoring, alerting)
- Config API (configuration, settings, preferences)
- Events API (event system, pub/sub, messaging)
- Storage API (storage, caching, persistence)

### API Types
- TypeScript/JavaScript API (direct access)
- REST API (HTTP endpoints)
- WebSocket API (real-time communication)
- CLI API (command-line interface)

## Design

```typescript
interface PluginAPI {
  // Core APIs
  chat: ChatAPI;
  rpg: RPGAPI;
  world: WorldAPI;
  battle: BattleAPI;
  trading: TradingAPI;
  state: StateAPI;
  
  // System APIs
  database: DatabaseAPI;
  filesystem: FilesystemAPI;
  network: NetworkAPI;
  crypto: CryptoAPI;
  
  // Utility APIs
  logger: LoggerAPI;
  config: ConfigAPI;
  events: EventsAPI;
  storage: StorageAPI;
}

interface ChatAPI {
  // Messages
  sendMessage(chatId: string, message: Message): Promise<Message>;
  getMessages(chatId: string, options: GetMessagesOptions): Promise<Message[]>;
  deleteMessage(messageId: string): Promise<void>;
  updateMessage(messageId: string, message: Message): Promise<Message>;
  
  // Conversations
  createConversation(participants: string[]): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  
  // Participants
  addParticipant(conversationId: string, participantId: string): Promise<void>;
  removeParticipant(conversationId: string, participantId: string): Promise<void>;
  getParticipants(conversationId: string): Promise<Participant[]>;
}

interface RPGAPI {
  // Characters
  createCharacter(character: Character): Promise<Character>;
  getCharacter(characterId: string): Promise<Character>;
  updateCharacter(characterId: string, character: Character): Promise<Character>;
  deleteCharacter(characterId: string): Promise<void>;
  
  // Skills
  checkSkill(characterId: string, skill: string, difficulty: number): Promise<SkillCheck>;
  rollDice(sides: number, count: number): Promise<DiceRoll>;
  
  // Inventory
  addItem(characterId: string, item: Item): Promise<void>;
  removeItem(characterId: string, itemId: string): Promise<void>;
  getInventory(characterId: string): Promise<Item[]>;
  
  // Leveling
  addExperience(characterId: string, amount: number): Promise<LevelUp>;
  getLevel(characterId: string): Promise<number>;
}

interface WorldAPI {
  // Locations
  createLocation(location: Location): Promise<Location>;
  getLocation(locationId: string): Promise<Location>;
  updateLocation(locationId: string, location: Location): Promise<Location>;
  deleteLocation(locationId: string): Promise<void>;
  
  // NPCs
  createNPC(npc: NPC): Promise<NPC>;
  getNPC(npcId: string): Promise<NPC>;
  updateNPC(npcId: string, npc: NPC): Promise<NPC>;
  deleteNPC(npcId: string): Promise<void>;
  
  // Items
  createItem(item: Item): Promise<Item>;
  getItem(itemId: string): Promise<Item>;
  updateItem(itemId: string, item: Item): Promise<Item>;
  deleteItem(itemId: string): Promise<void>;
  
  // Events
  createEvent(event: WorldEvent): Promise<WorldEvent>;
  getEvent(eventId: string): Promise<WorldEvent>;
  triggerEvent(eventId: string): Promise<void>;
}

interface BattleAPI {
  // Battles
  createBattle(battle: Battle): Promise<Battle>;
  getBattle(battleId: string): Promise<Battle>;
  deleteBattle(battleId: string): Promise<void>;
  
  // Turns
  startTurn(battleId: string): Promise<Turn>;
  endTurn(battleId: string): Promise<void>;
  getCurrentTurn(battleId: string): Promise<Turn>;
  
  // Actions
  performAction(battleId: string, action: Action): Promise<ActionResult>;
  getActions(battleId: string): Promise<Action[]>;
  
  // Damage
  dealDamage(battleId: string, targetId: string, amount: number): Promise<DamageResult>;
  healDamage(battleId: string, targetId: string, amount: number): Promise<HealResult>;
}

interface TradingAPI {
  // Trades
  createTrade(trade: Trade): Promise<Trade>;
  getTrade(tradeId: string): Promise<Trade>;
  deleteTrade(tradeId: string): Promise<void>;
  
  // Offers
  makeOffer(tradeId: string, offer: Offer): Promise<Offer>;
  acceptOffer(tradeId: string, offerId: string): Promise<void>;
  rejectOffer(tradeId: string, offerId: string): Promise<void>;
  
  // Inventory
  addItemToTrade(tradeId: string, itemId: string): Promise<void>;
  removeItemFromTrade(tradeId: string, itemId: string): Promise<void>;
  getTradeItems(tradeId: string): Promise<Item[]>;
}

interface StateAPI {
  // State management
  getState(key: string): Promise<unknown>;
  setState(key: string, value: unknown): Promise<void>;
  deleteState(key: string): Promise<void>;
  
  // Persistence
  saveState(): Promise<void>;
  loadState(): Promise<void>;
  clearState(): Promise<void>;
  
  // Modes
  getActiveModes(): Promise<string[]>;
  pushMode(mode: string): Promise<void>;
  popMode(mode: string): Promise<void>;
  switchMode(from: string, to: string): Promise<void>;
}

interface DatabaseAPI {
  // Queries
  query(sql: string, params: unknown[]): Promise<unknown[]>;
  execute(sql: string, params: unknown[]): Promise<unknown>;
  
  // Transactions
  transaction(callback: () => Promise<void>): Promise<void>;
  
  // Migrations
  migrate(): Promise<void>;
  rollback(): Promise<void>;
  
  // Schema
  createTable(table: Table): Promise<void>;
  dropTable(tableName: string): Promise<void>;
  alterTable(tableName: string, changes: TableChange[]): Promise<void>;
}

interface FilesystemAPI {
  // Files
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer): Promise<void>;
  deleteFile(path: string): Promise<void>;
  existsFile(path: string): Promise<boolean>;
  
  // Directories
  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
  
  // Streams
  createReadStream(path: string): ReadableStream;
  createWriteStream(path: string): WritableStream;
}

interface NetworkAPI {
  // HTTP
  request(options: RequestOptions): Promise<Response>;
  get(url: string): Promise<Response>;
  post(url: string, data: unknown): Promise<Response>;
  put(url: string, data: unknown): Promise<Response>;
  delete(url: string): Promise<Response>;
  
  // WebSocket
  connect(url: string): Promise<WebSocket>;
  send(ws: WebSocket, data: unknown): Promise<void>;
  close(ws: WebSocket): Promise<void>;
  
  // TCP/UDP
  createServer(options: ServerOptions): Promise<Server>;
  connectToServer(options: ConnectOptions): Promise<Socket>;
}

interface CryptoAPI {
  // Encryption
  encrypt(data: Buffer, key: Buffer): Promise<Buffer>;
  decrypt(data: Buffer, key: Buffer): Promise<Buffer>;
  
  // Hashing
  hash(data: Buffer): Promise<Buffer>;
  verify(data: Buffer, hash: Buffer): Promise<boolean>;
  
  // Signing
  sign(data: Buffer, key: Buffer): Promise<Buffer>;
  verifySignature(data: Buffer, signature: Buffer, key: Buffer): Promise<boolean>;
  
  // Key generation
  generateKey(): Promise<Buffer>;
  generateKeyPair(): Promise<KeyPair>;
}
```

## Tasks

- [ ] Design plugin API architecture
- [ ] Implement Chat API
- [ ] Implement RPG API
- [ ] Implement World API
- [ ] Implement Battle API
- [ ] Implement Trading API
- [ ] Implement State API
- [ ] Implement Database API
- [ ] Implement Filesystem API
- [ ] Implement Network API
- [ ] Implement Crypto API
- [ ] Implement Logger API
- [ ] Implement Config API
- [ ] Implement Events API
- [ ] Implement Storage API
- [ ] Implement REST API endpoints
- [ ] Implement WebSocket API
- [ ] Implement CLI API
- [ ] Implement API documentation
- [ ] Implement API versioning
- [ ] Write tests for plugin API

## Files

- `src/plugins/api/` — plugin API directory
- `src/plugins/api/chat.ts` — Chat API
- `src/plugins/api/rpg.ts` — RPG API
- `src/plugins/api/world.ts` — World API
- `src/plugins/api/battle.ts` — Battle API
- `src/plugins/api/trading.ts` — Trading API
- `src/plugins/api/state.ts` — State API
- `src/plugins/api/database.ts` — Database API
- `src/plugins/api/filesystem.ts` — Filesystem API
- `src/plugins/api/network.ts` — Network API
- `src/plugins/api/crypto.ts` — Crypto API
- `src/plugins/api/logger.ts` — Logger API
- `src/plugins/api/config.ts` — Config API
- `src/plugins/api/events.ts` — Events API
- `src/plugins/api/storage.ts` — Storage API
- `src/routes/plugins.ts` — REST API endpoints
- `src/plugins/websocket.ts` — WebSocket API
- `src/plugins/cli.ts` — CLI API
