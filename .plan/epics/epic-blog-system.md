# EPIC: Blog System

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** blog, llm-authored, comments, followings, privacy, assets

## Overview

A blog subsystem where LLMs can fully author posts — with or without deep
research, gathering external or internal-only information, and producing news.
Blogs reuse chat functionality and design for record storage and asset
generation. Includes a reader-facing social layer: comments, followings, and
public/private profile tiers (readers, followers, comment sections). Questionable
LLM or human behavior can be optionally disabled.

This epic reuses, not re-implements, chat: blog records are chat-shaped and lean
on the existing message / asset / generation pipelines.

## LLM-Authored Blogs

### Authoring Modes

| Mode | Information source | Notes |
|------|-------------------|-------|
| Automated | Internal world/character state only | No external calls |
| Deep research | External web + internal | Requires research tooling |
| News | External feeds + internal | Time-sensitive |

### Behavior Controls

| Control | Description |
|---------|-------------|
| Disable questionable LLM behavior | Gate off risky generation patterns |
| Disable questionable human behavior | Moderation on human-authored posts/comments |

### Asset & Design Reuse

- Reuse chat message record schema for blog posts
- Reuse asset generation pipeline for inline images / media
- Creative LLMs may generate new worlds/ideas that become assistant scenario sources

```typescript
interface BlogPost {
  id: string;
  author: ActorRef;
  mode: 'automated' | 'deep_research' | 'news';
  body: MessageRef[];          // chat-shaped record
  assets: AssetRef[];
  research_sources?: SourceRef[];
  generated_world_seed?: string; // feeds assistant scenario source
  privacy_tier: PrivacyTier;
}
```

## Reader Social Layer

### Comments, Followings, Privacy

| Feature | Description |
|---------|-------------|
| Comments | Threaded replies on posts (reuse comment moderation from chat-lifecycle) |
| Followings | Reader follows author / blog |
| Privacy tiers | Public / followers-only / private per post and per profile |

### Profile

| Element | Description |
|---------|-------------|
| Public/private profile | Reader-facing identity |
| Readers | Count + list of consumers |
| Followers | Subscription relationship |
| Comment sections | Per-post discussion surface |

```typescript
type PrivacyTier = 'public' | 'followers' | 'private';

interface BlogProfile {
  owner: ActorRef;
  visibility: PrivacyTier;
  followers: ActorRef[];
  reader_count: number;
}
```

## Tasks

- [ ] Blog post schema (chat-shaped record)
- [ ] LLM authoring modes (automated / deep research / news)
- [ ] Research-source gathering + citation
- [ ] Questionable-behavior disablement gates (LLM + human)
- [ ] Asset generation reuse for posts
- [ ] Generated-world seed → assistant scenario source bridge
- [ ] Comments (threaded, moderated)
- [ ] Followings + follower relationships
- [ ] Privacy tiers (post + profile)
- [ ] Reader/follower/comment UI surfaces

## Files

- `src/blog/post.ts` — blog post model + authoring
- `src/blog/research.ts` — deep-research / news gathering
- `src/blog/social.ts` — comments, followings, privacy
- `src/blog/profile.ts` — reader profile
- `src/assistant/scenario-source.ts` — consume generated-world seeds
- `src/db/schema.ts` — blog_post, blog_comment, blog_follow tables
