import { createTestServer } from "./tests/e2e/helpers/server";
import { seedUsers, SEED } from "./tests/e2e/helpers/seed";

const server = await createTestServer();
await seedUsers(server.db);

// Directly test login as form-encoded
const formBody = new URLSearchParams({
  username: SEED.user.username,
  password: SEED.user.password
}).toString();
console.log("formBody:", formBody);

const res = await fetch(`${server.url}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: formBody,
  redirect: "manual",
});

console.log("status:", res.status);
console.log("ok:", res.ok);
console.log("headers:", JSON.stringify([...res.headers.entries()]));

const setCookie = res.headers.get("Set-Cookie");
console.log("Set-Cookie:", setCookie);

const text = await res.text();
console.log("body:", text.substring(0, 200));

server.close();
