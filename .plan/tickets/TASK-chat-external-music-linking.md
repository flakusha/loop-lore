# TASK: Chat External Music Linking

**Epic:** Chat Lifecycle & Moderation
**Priority:** Low
**Effort:** Medium
**Status:** Not Started
**Source:** `.tmp/loop-lore-ideas.md` — Chat Atmosphere: linkable music

## Summary

Linkable music from external services (Spotify, YouTube Music, SoundCloud, etc.)
for chat atmosphere. The frontend plays music through the browser/app — the
server does NOT download or host any music content (copyright-safe). Users
share links that appear as playable embeds in chat.

## Rationale

- Music enhances chat atmosphere and immersion
- Server-side hosting of music is copyright-risky and expensive
- Browser-native playback via iframe/embed is safe and lightweight
- External service links are user-controlled and revocable

## Design

### Supported Services

| Service           | Embed Method    | Limitations                    |
| ----------------- | --------------- | ------------------------------ |
| **Spotify**       | oEmbed / iframe | Requires public track/playlist |
| **YouTube Music** | iframe embed    | May have regional restrictions |
| **SoundCloud**    | oEmbed API      | Public tracks only             |
| **Apple Music**   | iframe embed    | Requires public link           |
| **Bandcamp**      | iframe embed    | Direct artist support          |

### Music Link Message

```typescript
interface MusicLinkMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  service: MusicService;
  url: string; // Original URL
  embed_html: string; // iframe embed code (from oEmbed)
  title: string; // Track/playlist name
  artist: string; // Artist/creator name
  thumbnail_url?: string; // Album art
  duration?: number; // Seconds
  metadata: MusicMetadata;
}

type MusicService = "spotify" | "youtube_music" | "soundcloud" | "apple_music" | "bandcamp";

interface MusicMetadata {
  service_track_id: string; // ID on the service
  service_url: string; // Deep link to open in app
  is_playlist: boolean;
  track_count?: number; // For playlists
  explicit: boolean;
  year?: number;
  genre?: string;
}
```

### Frontend Playback

- Music links render as embedded players in chat messages
- Players are lightweight iframes (no autoplay — user clicks play)
- Players show track info, album art, and play controls
- Multiple music links in a chat create a playlist queue
- Volume is controlled per-player (browser default)

### Server-Side (No Content Download)

The server ONLY:

- Validates that the URL is from a supported service
- Fetches oEmbed metadata (title, artist, thumbnail, embed HTML)

- Stores the metadata + embed HTML
- Does NOT download, cache, or re-serve any audio content

```typescript
interface MusicLinkService {
  validateUrl(url: string,): Promise<boolean>;
  fetchMetadata(url: string,): Promise<MusicMetadata>;
  getEmbedHtml(url: string,): Promise<string>;
}
```

### Chat Atmosphere Controls

| Setting         | Description                                   |
| --------------- | --------------------------------------------- |
| **Auto-expand** | Whether music players expand automatically    |
| **Autoplay**    | Never (copyright-safe) — user must click play |
| **Queue**       | Multiple music links form a playlist          |
| **Volume sync** | All players in a chat share volume level      |
| **NSFW filter** | Hide music links flagged explicit             |

## Integration Points

- **Chat Messages** (Epic 36): Music links as a message type
- **Assets** (Epic 28): Thumbnail storage for album art
- **NSFW Control** (Epic 36): Explicit content filtering
- **Chat Atmosphere** (ideas): Part of broader atmosphere system

## Tasks

- [ ] Design music link message type + schema
- [ ] Implement URL validation for supported services
- [ ] Implement oEmbed metadata fetching
- [ ] Implement music link storage (no audio content)
- [ ] Add music link message rendering in frontend
- [ ] Add chat atmosphere settings (auto-expand, queue, volume)
- [ ] Add NSFW filtering for explicit music
- [ ] Write tests for URL validation + metadata fetching

## Risk

Low — server never hosts audio content. Main risk: external service embed availability
(rate limiting, API changes, regional restrictions). Embed HTML from oEmbed may break
if services change their embed format.

## Files

- `src/chat/music-links.ts` — music link service
- `src/db/schema-chat.ts` — music_link table
- `src/frontend/components/music-player.html` — embed component
- `src/frontend/alpine/chat.ts` — music link rendering

## Related

- Epic 36 (Chat Lifecycle & Moderation) — NSFW filtering, message types
- Epic 28 (Asset Support Expansion) — Thumbnail storage
- Epic 42 (Assistant Generation Extensions) — Music generation (different)
- `.tmp/loop-lore-ideas.md` — Chat Atmosphere section

## Notes

- **Copyright-safe**: Server never downloads or hosts audio content
- **User-controlled**: Links can be removed by users at any time
- **Service-dependent**: Embed availability depends on external service uptime
- **No autoplay**: Always requires user interaction to play (browser policy)
