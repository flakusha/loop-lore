import { createTestServer } from "./tests/e2e/helpers/server";
import { createClient } from "./tests/e2e/helpers/client";
import { seedUsers, seedChat, SEED } from "./tests/e2e/helpers/seed";

const server = await createTestServer();
const api = createClient(server.url);

// Step 1: loginAs
const loginOk = await api.loginAs(SEED.user.username, SEED.user.password);
console.log("1. loginAs ok:", loginOk, "token:", api.token);

if (!api.token) {
  // Debug: try the request manually
  const formBody = new URLSearchParams({ username: SEED.user.username, password: SEED.user.password }).toString();
  const res = await fetch(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
    redirect: "manual",
  });
  console.log("2. manual login status:", res.status);
  const setCookie = res.headers.get("Set-Cookie");
  console.log("3. manual Set-Cookie:", setCookie);
  
  // Extract manually
  const match = /ll_token=([^;]+)/.exec(setCookie || "");
  if (match) {
    api.setToken(match[1]);
    console.log("4. manually set token:", match[1]);
  }
}

// Now seed and test
await seedUsers(server.db);
await seedChat(server.db);

const chatRes = await api.get(`/api/chats/${SEED.chat.id}`);
console.log("5. GET chat status:", chatRes.status, "error:", chatRes.error?.substring(0, 60));

const charRes = await api.get(`/api/actors/${SEED.character.id}`);
console.log("6. GET char status:", charRes.status, "error:", charRes.error?.substring(0, 60));

server.close();
