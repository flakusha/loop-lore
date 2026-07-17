/* Global declarations for vanilla page loaders */
declare function selectCharacterCard(id: string): Promise<void>;
declare function startChatFromChar(btn: HTMLElement): Promise<void>;
declare function editCharacter(btn: HTMLElement): void;
declare function deleteCharacter(btn: HTMLElement): Promise<void>;
declare function openAssetPreview(id: string): Promise<void>;
declare function copyAssetUrl(): Promise<void>;
declare function downloadAsset(): void;
declare function deleteAssetPreview(): Promise<void>;
declare function createWorld(event: Event): Promise<void>;
declare function saveCharacterEdit(id: string): Promise<void>;

/* Vendor module declarations - bun bundler resolves these; types are any */
declare module "alpinejs" {
  const Alpine: any;
  export default Alpine;
}

declare module "@alpinejs/morph" {
  const morph: any;
  export default morph;
}
