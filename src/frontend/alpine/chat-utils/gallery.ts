// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import { jsonBody, } from "../json";
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

  /**
   * Upload file(s) and link them to the active chat, then refresh the
   * in-chat gallery list. Mirrors handleAttach's upload path but additionally
   * creates the chat→asset link so the asset shows up in the sidebar.
   * @param event The change event from the sidebar's file input.
   */
  async uploadChatAssets(event: Event,) {
    const activeChat = this.activeChat;
    if (!activeChat) {
      this.$dispatch?.(`show-toast`, { type: "warning", message: t("toasts.selectChatFirst",), },);
      return;
    }
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) { return; }

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file,);
      formData.append("alt_text", file.name,);
      try {
        const res = await apiFetch("/api/assets", { method: "POST", body: formData, },);
        let assetId: string | null = null;
        if (res.ok) {
          const asset = await res.json();
          assetId = asset.id;
        } else {
          const err = await res.json();
          this.$dispatch?.(`show-toast`, {
            type: "error",
            message: err?.error || t("toasts.failedUpload", { filename: file.name, },),
          },);
        }
        if (assetId) {
          const linkRes = await apiFetch(`/api/assets/${assetId}/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ entityType: "chat", entityId: activeChat, label: "scene", },),
          },);
          if (linkRes.ok) {
            this.$dispatch?.(`show-toast`, {
              type: "success",
              message: t("toasts.assetUploaded",),
            },);
          }
        }
      } catch {
        this.$dispatch?.(`show-toast`, {
          type: "error",
          message: t("toasts.networkErrorUploading", { filename: file.name, },),
        },);
      }
    }
    input.value = "";
    await this.loadGalleryAssets();
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
