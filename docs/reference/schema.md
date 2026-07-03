# Database Schema

## Overview

Loop Lore uses a relational database schema designed for flexibility and extensibility. The schema is managed using Drizzle ORM migrations.

## Tables

### Users

Stores user account information.

| Column        | Type        | Description                        |
| ------------- | ----------- | ---------------------------------- |
| id            | TEXT (UUID) | Primary key                        |
| username      | TEXT        | Unique username                    |
| email         | TEXT        | Unique email address               |
| password_hash | TEXT        | Hashed password                    |
| role          | TEXT        | User role (user, admin, moderator) |
| created_at    | TIMESTAMP   | Account creation timestamp         |
| updated_at    | TIMESTAMP   | Last update timestamp              |
| is_active     | BOOLEAN     | Account status                     |

### Sessions

Manages user sessions for authentication.

| Column     | Type        | Description                |
| ---------- | ----------- | -------------------------- |
| id         | TEXT (UUID) | Primary key                |
| user_id    | TEXT (UUID) | Foreign key to users.id    |
| token_hash | TEXT        | Hashed session token       |
| expires_at | TIMESTAMP   | Session expiration time    |
| created_at | TIMESTAMP   | Session creation timestamp |
| ip_address | TEXT        | Client IP address          |
| user_agent | TEXT        | Client user agent          |

### Chats

Represents chat rooms or conversation threads.

| Column      | Type        | Description                     |
| ----------- | ----------- | ------------------------------- |
| id          | TEXT (UUID) | Primary key                     |
| user_id     | TEXT (UUID) | Foreign key to users.id (owner) |
| name        | TEXT        | Chat name/title                 |
| description | TEXT        | Chat description                |
| is_private  | BOOLEAN     | Whether chat is private         |
| created_at  | TIMESTAMP   | Creation timestamp              |
| updated_at  | TIMESTAMP   | Last update timestamp           |

### Characters

Represents characters that can participate in chats.

| Column      | Type        | Description                     |
| ----------- | ----------- | ------------------------------- |
| id          | TEXT (UUID) | Primary key                     |
| user_id     | TEXT (UUID) | Foreign key to users.id (owner) |
| name        | TEXT        | Character name                  |
| description | TEXT        | Character description/backstory |
| avatar_url  | TEXT        | URL to character avatar/image   |
| created_at  | TIMESTAMP   | Creation timestamp              |
| updated_at  | TIMESTAMP   | Last update timestamp           |

### Messages

Individual messages within chats.

| Column       | Type        | Description                                         |
| ------------ | ----------- | --------------------------------------------------- |
| id           | TEXT (UUID) | Primary key                                         |
| chat_id      | TEXT (UUID) | Foreign key to chats.id                             |
| user_id      | TEXT (UUID) | Foreign key to users.id (sender)                    |
| character_id | TEXT (UUID) | Foreign key to characters.id (if character message) |
| content      | TEXT        | Message content                                     |
| message_type | TEXT        | Type: user, character, system                       |
| created_at   | TIMESTAMP   | Message timestamp                                   |
| metadata     | JSONB       | Additional metadata (token count, etc.)             |

### Assets

Media files uploaded by users (images, audio, video).

| Column       | Type        | Description                        |
| ------------ | ----------- | ---------------------------------- |
| id           | TEXT (UUID) | Primary key                        |
| user_id      | TEXT (UUID) | Foreign key to users.id (uploader) |
| filename     | TEXT        | Original filename                  |
| mime_type    | TEXT        | MIME type of file                  |
| asset_type   | TEXT        | Type: image, audio, video          |
| size_bytes   | INTEGER     | File size in bytes                 |
| storage_path | TEXT        | Path to stored file                |
| created_at   | TIMESTAMP   | Upload timestamp                   |

### Asset Links

Polymorphic linking table for assets to entities.

| Column      | Type        | Description                                 |
| ----------- | ----------- | ------------------------------------------- |
| id          | TEXT (UUID) | Primary key                                 |
| asset_id    | TEXT (UUID) | Foreign key to assets.id                    |
| entity_type | TEXT        | Type: user, character, chat, world, message |
| entity_id   | TEXT (UUID) | ID of the entity                            |
| label       | TEXT        | Label for the link (avatar, portrait, etc.) |
| created_at  | TIMESTAMP   | Link creation timestamp                     |

### Worlds

Game worlds or settings for roleplay.

| Column      | Type        | Description                     |
| ----------- | ----------- | ------------------------------- |
| id          | TEXT (UUID) | Primary key                     |
| user_id     | TEXT (UUID) | Foreign key to users.id (owner) |
| name        | TEXT        | World name                      |
| description | TEXT        | World description/ lore         |
| created_at  | TIMESTAMP   | Creation timestamp              |
| updated_at  | TIMESTAMP   | Last update timestamp           |

### World Elements

Elements within worlds (locations, items, NPCs, etc.).

| Column       | Type        | Description                      |
| ------------ | ----------- | -------------------------------- |
| id           | TEXT (UUID) | Primary key                      |
| world_id     | TEXT (UUID) | Foreign key to worlds.id         |
| name         | TEXT        | Element name                     |
| element_type | TEXT        | Type: location, item, npc, event |
| description  | TEXT        | Element description              |
| properties   | JSONB       | Custom properties/data           |
| created_at   | TIMESTAMP   | Creation timestamp               |
| updated_at   | TIMESTAMP   | Last update timestamp            |

## Relationships

- Users 1:∞ Sessions (one user can have multiple sessions)
- Users 1:∞ Channels (one user can own multiple chats)
- Users 1:∞ Characters (one user can own multiple characters)
- Users 1:∞ Assets (one user can upload multiple assets)
- Users 1:∞ Worlds (one user can own multiple worlds)
- Chats 1:∞ Messages (one chat can contain multiple messages)
- Characters 0:∞ Messages (characters can send multiple messages)
- Assets 1:∞ Asset Links (one asset can be linked to multiple entities)
- Worlds 1:∞ World Elements (one world can contain multiple elements)

## Indexes

Primary indexes are automatically created on primary key columns. Additional indexes include:

- users.username (unique)
- users.email (unique)
- sessions.token_hash (unique)
- sessions.expires_at
- chats.user_id
- messages.chat_id
- messages.created_at
- assets.user_id
- asset_links.asset_id
- asset_links.entity_type, asset_links.entity_id
- worlds.user_id
- world_elements.world_id

## Extensions

The schema uses PostgreSQL-specific extensions when running on PostgreSQL:

- uuid-ossp (for UUID generation)
- pg_trgm (for text search)
- btree_gin (for JSONB indexing)

When using SQLite, equivalent functionality is provided through built-in functions and JSON1 extension.

## Migrations

Database migrations are managed by Drizzle ORM and stored in the `drizzle/` directory. Each migration file contains:

- `up()` function: Applies the migration
- `down()` function: Rolls back the migration

Migrations are automatically applied on startup in development mode. In production, run `bun run db:migrate` to apply pending migrations.
