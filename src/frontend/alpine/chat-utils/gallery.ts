import { t, } from "../i18n";
import type { ChatState, } from "../types";

export type ChatUtilsGallery = Partial<ChatState> & ThisType<ChatState>;

export const chatUtilsGallery: ChatUtilsGallery = {
  getMediaStyle(asset: any, totalCount: number,): Record<string, string> {
    const style: Record<string, string> = {};
    if (asset.type === "image" && asset.width && asset.height) {
      const ratio = asset.width / asset.height;
      if (totalCount === 1) {
        if (ratio > 1.78) {
          style.width = "100%";
          style.maxHeight = "400px";
        } else if (ratio < 0.56) {
          style.width = "40%";
          style.float = "right";
          style.marginLeft = "12px";
        } else {
          style.width = "50%";
          style.float = "left";
          style.marginRight = "12px";
        }
      } else {
        style.width = totalCount === 2 ? "calc(50% - 6px)" : "calc(33.33% - 8px)";
        style.aspectRatio = "1";
        style.objectFit = "cover";
      }
    }
    return style;
  },

  openMediaPreview(asset: any,) {
    if (asset.type === "image") {
      window.open(asset.url, "_blank", "noopener,noreferrer",);
    }
  },

  openAssetPreview(
    asset: {
      id: string;
      asset_type?: string;
      filename?: string;
      name?: string;
      mime_type?: string;
      size_bytes?: number;
      width?: number;
      height?: number;
      alt_text?: string;
      visibility?: string;
    },
  ) {
    if (!asset?.id) { return; }
    const url = `/api/assets/${asset.id}/raw`;
    this.previewMediaAsset = {
      id: asset.id,
      filename: asset.filename || asset.name || t("gallery.assetFallback",),
      asset_type: asset.asset_type,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      width: asset.width,
      height: asset.height,
      alt_text: asset.alt_text,
      visibility: asset.visibility,
      type: asset.asset_type || "image",
      url,
      caption: asset.alt_text || asset.filename || asset.name,
    };
  },

  async loadGalleryAssets() {
    const activeChat = this.activeChat;
    if (!activeChat) { return; }
    try {
      const url = `/api/assets?entity_type=chat&entity_id=${activeChat}&pageSize=200`;
      const res = await apiFetch(url,);
      if (res.ok) {
        const data = await res.json();
        this.galleryAssets = data.data || [];
      } else {
        this.galleryAssets = [];
      }
    } catch {
      this.galleryAssets = [];
    }
  },

  async loadCharacterInfo() {
    const activeChat = this.activeChat;
    if (!activeChat) { return; }
    this.currentCharacter = null;
    try {
      const res = await apiFetch(`/api/v1/chats/${activeChat}`,);
      if (res.ok) {
        const chat = await res.json();
        if (chat.character_id) {
          const charRes = await apiFetch(`/api/actors/${chat.character_id}`,);
          if (charRes.ok) {
            this.currentCharacter = await charRes.json();
          }
        }
      }
    } catch {
      // Silent
    }
  },
};
