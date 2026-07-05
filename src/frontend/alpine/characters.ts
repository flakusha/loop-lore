// ── Character Chat List page (character-chat-list.html) ──

globalThis.characterChatListState = function () {
  return {
    characterId: null as string | null,
    characterName: null as string | null,
    chats: [] as any[],
    loading: true,

    async init() {
      // eslint-disable-next-line sonarjs/prefer-regexp-exec
      const match = location.pathname.match(/\/character\/([\w-]+)/);
      if (match) {
        this.characterId = match[1];
        await this.loadCharacter();
        await this.loadChats();
      }
    },

    async loadCharacter() {
      try {
        const res = await apiFetch(`/api/actors/${this.characterId}`);
        if (res.ok) {
          const char = await res.json();
          this.characterName = char.display_name || char.name || this.characterId;
        }
      } catch {
        this.characterName = this.characterId;
      }
    },

    async loadChats() {
      this.loading = true;
      try {
        const res = await apiFetch(`/api/chats?characterId=${this.characterId}&pageSize=50`);
        const data = await res.json();
        this.chats = data.data || [];
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load chats" });
      } finally {
        this.loading = false;
      }
    },

    openChat(chat: any) {
      history.pushState({}, "", `/character/${this.characterId}/${chat.id}`);
      globalThis.htmx.ajax("GET", "/views/chat", { target: "#app-root", swap: "innerHTML" });
    },

    formatTime(iso: string) {
      if (!iso) return "";
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60_000) return "just now";
      if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
      if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h ago";
      return Math.floor(diff / 86_400_000) + "d ago";
    },
  };
};

// ── Characters page component (characters.html) ──────────

globalThis.charactersState = function () {
  return {
    characters: [] as any[],
    loading: true,
    searchQuery: "",
    selectedTag: "",
    selectedChar: null as any,

    get filteredCharacters() {
      let result = this.characters;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        result = result.filter((c: any) => (c.display_name || "").toLowerCase().includes(q));
      }
      if (this.selectedTag) {
        result = result.filter((c: any) => (c.tags || []).includes(this.selectedTag));
      }
      return result;
    },

    get allTags(): string[] {
      const all = this.characters.flatMap((c: any) => c.tags || []);
      return [...new Set(all as string[])];
    },

    async init() {
      await this.loadCharacters();
    },

    async loadCharacters() {
      this.loading = true;
      try {
        const res = await apiFetch("/api/actors?pageSize=100");
        const data = await res.json();
        this.characters = data.data || [];
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load characters" });
      } finally {
        this.loading = false;
      }
    },

    selectCharacter(char: any) {
      this.selectedChar = char;
    },

    closeDetail() {
      this.selectedChar = null;
    },

    async startChat(char: any) {
      try {
        const res = await apiFetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Chat with ${char.display_name}`,
            type: "user_character",
            mode: "roleplay",
            participantIds: [char.id],
          }),
        });
        const data = await res.json();
        if (data.id) {
          location.assign("/views/chat");
        } else {
          (this as any).$dispatch("show-toast", { type: "error", message: "Failed to create chat" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      }
    },

    editCharacter(char: any) {
      location.assign(`/character/${char.id}/edit`);
    },

    async deleteCharacter(char: any) {
      if (!confirm(`Delete "${char.display_name}"?`)) return;
      try {
        const res = await apiFetch(`/api/actors/${char.id}`, { method: "DELETE" });
        if (res.ok) {
          this.selectedChar = null;
          (this as any).$dispatch("show-toast", { type: "success", message: "Character deleted" });
          await this.loadCharacters();
        } else {
          const err = await res.json();
          (this as any).$dispatch("show-toast", { type: "error", message: err.error || "Failed to delete" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      }
    },
  };
};

// ── Character Edit page component (character-edit.html) ──

globalThis.characterEditState = function () {
  return {
    character: null as any,
    loading: true,
    saving: false,

    async init() {
      // eslint-disable-next-line sonarjs/prefer-regexp-exec
      const match = location.pathname.match(/\/(?:character|characters)\/([\w-]+)\/edit/);
      if (match) {
        await this.loadCharacter(match[1]);
      } else {
        this.loading = false;
      }
    },

    async loadCharacter(characterId: string) {
      this.loading = true;
      try {
        const res = await apiFetch(`/api/actors/${characterId}`);
        if (res.ok) {
          this.character = await res.json();
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load character" });
      } finally {
        this.loading = false;
      }
    },

    async saveCharacter() {
      if (!this.character?.id) return;
      this.saving = true;
      try {
        const data = {
          displayName: this.character.display_name,
          description: this.character.description,
          systemPrompt: this.character.system_prompt,
          personality: this.character.personality,
          welcomeMessage: this.character.welcome_message,
          mesExample: this.character.mes_example,
        };
        const res = await apiFetch(`/api/actors/${this.character.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          (this as any).$dispatch("show-toast", { type: "success", message: "Character saved" });
          history.back();
        } else {
          const err = await res.json();
          (this as any).$dispatch("show-toast", { type: "error", message: err.error || "Failed to save" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      } finally {
        this.saving = false;
      }
    },
  };
};

document.addEventListener("htmx:loadTheme", (e: CustomEvent<{ theme?: string }>) => {
  if (!(e.detail && e.detail.theme)) {
    return;
  }

  const Alpine = globalThis.Alpine;
  if (Alpine) {
    const rootData = Alpine.$data(document.body);
    if (rootData && typeof rootData.setTheme === "function") {
      rootData.setTheme(e.detail.theme);
    }
  }
});
