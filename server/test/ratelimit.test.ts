import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, db, resetDb, SITE_PIN, startApi, type Api } from "./helpers.ts";

const wrong = (api: Api, ip: string) =>
  call(api, "POST", "/api/auth/unlock", { body: { pin: "000000", as: "me" }, ip });
const right = (api: Api, ip: string) =>
  call(api, "POST", "/api/auth/unlock", { body: { pin: SITE_PIN, as: "me" }, ip });

describe("PIN rate limiting", () => {
  let api: Api;
  before(async () => {
    api = await startApi();
  });
  after(() => api.close());
  beforeEach(resetDb);

  test("5 wrong tries lock the IP for 15 minutes, even for the right PIN", async () => {
    const ip = "203.0.113.5";
    for (let i = 1; i <= 4; i++) assert.equal((await wrong(api, ip)).status, 401, `try ${i}`);
    const fifth = await wrong(api, ip);
    assert.equal(fifth.status, 429);
    assert.equal(fifth.body.retryAfter, 900);

    const blocked = await right(api, ip);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.setCookie, null);
    assert.ok(Number(blocked.body.retryAfter) > 880);
  });

  test("the lockout is per IP", async () => {
    for (let i = 0; i < 5; i++) await wrong(api, "203.0.113.6");
    assert.equal((await right(api, "203.0.113.7")).status, 200);
  });

  test("tries left are counted down", async () => {
    const ip = "203.0.113.8";
    assert.match((await wrong(api, ip)).body.error, /4 tries left/);
    assert.match((await wrong(api, ip)).body.error, /3 tries left/);
  });

  test("after the lockout ends, the count starts again", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 5; i++) await wrong(api, ip);
    await db`update pin_attempts set locked_until = now() - interval '1 second' where ip = ${ip}`;
    assert.match((await wrong(api, ip)).body.error, /4 tries left/);
    assert.equal((await right(api, ip)).status, 200);
  });

  test("a correct PIN clears earlier failures", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 4; i++) await wrong(api, ip);
    assert.equal((await right(api, ip)).status, 200);
    assert.match((await wrong(api, ip)).body.error, /4 tries left/);
  });

  test("the lockout is stored in the database (survives a restart)", async () => {
    const ip = "203.0.113.11";
    for (let i = 0; i < 5; i++) await wrong(api, ip);
    await api.close();
    api = await startApi();
    assert.equal((await right(api, ip)).status, 429);
  });
});
