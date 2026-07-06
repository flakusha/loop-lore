/* Global declarations for vanilla page loaders */
declare function loadCharactersPage(): Promise<void>;
declare function selectCharacterCard(id: string): Promise<void>;
declare function startChatFromChar(btn: HTMLElement): Promise<void>;
declare function editCharacter(btn: HTMLElement): void;
declare function deleteCharacter(btn: HTMLElement): Promise<void>;
declare function loadGalleryPage(): Promise<void>;
declare function openAssetPreview(id: string): Promise<void>;
declare function copyAssetUrl(): Promise<void>;
declare function downloadAsset(): void;
declare function deleteAssetPreview(): Promise<void>;
declare function loadWorldsPage(): Promise<void>;
declare function loadWorldDetail(): Promise<void>;
declare function loadCharacterChatList(): Promise<void>;
declare function saveCharacterEdit(id: string): Promise<void>;
declare function escapeAttr(s: string): string;
