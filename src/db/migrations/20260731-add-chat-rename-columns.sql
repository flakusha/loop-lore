-- 20260731-add-chat-rename-columns.sql
-- Migration to add `name` and `name_source` columns to the `chats` table

-- Add the `name` column (stores the current chat name)
ALTER TABLE chats ADD COLUMN name TEXT;

-- Add the `name_source` column (tracks how the name was generated)
-- Allowed values: "manual", "auto-rule", "auto-llm"
ALTER TABLE chats ADD COLUMN name_source TEXT;

-- Optional: add an index to speed up look-ups by name
CREATE INDEX idx_chats_name ON chats (name);