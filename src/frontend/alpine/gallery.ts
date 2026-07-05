// ── Gallery page component (gallery.html) ──────────────────

interface GalleryAsset {
  id: string;
  name?: string;
  filename?: string;
  asset_type?: string;
  mime_type?: string;
  size_bytes?: number;
  storage_path?: string;
}

globalThis.galleryState = function () {
  return {
    showUploadModal: false,
    previewAsset: null as GalleryAsset | null,
    filterType: "",
    searchQuery: "",
    assetCount: 0,
    assets: [] as GalleryAsset[],
    loading: false,
    uploading: false,
    uploadLabel: "",

    init() {
      this.loadAssets();
    },

    async loadAssets() {
      this.loading = true;
      try {
        const params = new URLSearchParams({ pageSize: "200" });
        if (this.filterType) params.set("type", this.filterType);
        if (this.searchQuery) params.set("q", this.searchQuery);

        const res = await apiFetch("/api/assets?" + params.toString());
        if (res.ok) {
          const data = await res.json();
          this.assets = data.data || [];
          this.assetCount = data.total || this.assets.length;
        } else {
          this.assets = [];
          this.assetCount = 0;
        }
      } catch {
        this.assets = [];
        this.assetCount = 0;
      } finally {
        this.loading = false;
      }
    },

    openPreview(asset: GalleryAsset) {
      this.previewAsset = asset;
    },

    /** Copy asset raw URL to clipboard */
    async copyAssetUrl(asset: GalleryAsset) {
      if (!asset?.id) return;
      const url = `${location.origin}/api/assets/${asset.id}/raw`;
      try {
        await navigator.clipboard.writeText(url);
        (this as any).$dispatch("show-toast", { type: "success", message: "URL copied" });
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to copy URL" });
      }
    },

    /** Download asset file */
    downloadAsset(asset: GalleryAsset) {
      if (!asset?.id) return;
      const a = document.createElement("a");
      a.href = `/api/assets/${asset.id}/raw`;
      a.download = asset.filename || "asset";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    },

    /** Link asset to a chat */
    async linkAssetToChat(assetId: string) {
      if (!assetId) return;
      const chatId = prompt("Enter chat ID to link this asset to:");
      if (!chatId?.trim()) return;
      try {
        const res = await apiFetch(`/api/assets/${assetId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "chat", entityId: chatId.trim() }),
        });
        if (res.ok) {
          (this as any).$dispatch("show-toast", { type: "success", message: "Linked to chat" });
        } else {
          (this as any).$dispatch("show-toast", { type: "error", message: "Failed to link" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      }
    },

    async deleteAsset(id: string) {
      if (!confirm("Delete this asset?")) return;
      try {
        const res = await apiFetch("/api/assets/" + id, { method: "DELETE" });
        if (res.ok) {
          this.previewAsset = null;
          (this as any).$dispatch("show-toast", { type: "success", message: "Asset deleted" });
          await this.loadAssets();
        } else {
          (this as any).$dispatch("show-toast", { type: "error", message: "Failed to delete" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      }
    },

    async uploadAsset(_event: Event) {
      const fileInput = (this as any).$refs.fileInput as HTMLInputElement | undefined;
      const file = fileInput?.files?.[0];
      if (!file) return;

      this.uploading = true;
      const formData = new FormData();
      formData.append("file", file);
      if (this.uploadLabel) formData.append("alt_text", this.uploadLabel);

      try {
        const res = await apiFetch("/api/assets", { method: "POST", body: formData });
        if (res.ok) {
          this.showUploadModal = false;
          this.uploadLabel = "";
          fileInput!.value = "";
          (this as any).$dispatch("show-toast", { type: "success", message: "Asset uploaded" });
          await this.loadAssets();
        } else {
          const err = await res.json();
          (this as any).$dispatch("show-toast", { type: "error", message: err.error || "Upload failed" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error uploading" });
      } finally {
        this.uploading = false;
      }
    },

    handleDrop(event: DragEvent) {
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        const input = (this as any).$refs.fileInput as HTMLInputElement | undefined;
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
        }
      }
    },

    formatSize(bytes: number) {
      if (!bytes) return "";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1_048_576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1_048_576).toFixed(1) + " MB";
    },
  };
};

