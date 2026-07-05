import { createTestServer } from "./tests/e2e/helpers/server";
import { createClient } from "./tests/e2e/helpers/client";
import { seedUsers, seedChat, SEED } from "./tests/e2e/helpers/seed";

const server = await createTestServer();
const api = createClient(server.url);

// First login as demo user
await api.login();
const meResDemo = await api.get("/api/auth/me");
console.log("GET /api/auth/me (demo):", meResDemo.status, JSON.stringify(meResDemo.data));

// Logout and clear
api.logout();

// Seed and login as seeded user
await seedUsers(server.db);
await seedChat(server.db);
const loginOk = await api.loginAs(SEED.user.username, SEED.user.password);
console.log("loginAs:", loginOk ? "succeeded" : "failed", "token:", api.token ? "yes" : "no");

// Try to access seeded chat
const res = await api.get(`/api/chats/${SEED.chat.id}`);
console.log("chat status:", res.status, "error:", res.error?.substring(0, 80));

// Try to get seed character (not seeded yet)
const charRes = await api.get(`/api/actors/${SEED.character.id}`);
console.log("char status:", charRes.status, "error:", charRes.error?.substring(0, 80));

// List actors
const actorsRes = await api.get("/api/actors");
console.log("actors list status:", actorsRes.status);
console.log("actors data:", JSON.stringify(actorsRes.data?.data?.slice(0, 3)));

server.close();
