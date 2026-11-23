import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, DOCTOR_PIN, login, resetDb, SITE_PIN, startApi, type Api } from "./helpers.ts";

describe("PIN verification and sessions", () => {
  let api: Api;
  before(async () => {
    api = await startApi();
  });
  after(() => api.close());
  beforeEach(resetDb);

  test("no cookie means public mode", async () => {
    const r = await call(api, "GET", "/api/auth/session");
    assert.equal(r.status, 200);
    assert.equal(r.body.mode, "public");
    assert.match(r.body.postOp.label, /^Week \d+ · Day \d+$/);
  });

  test("site PIN unlocks 'me' with a 30-day httpOnly cookie", async () => {
    const r = await call(api, "POST", "/api/auth/unlock", { body: { pin: SITE_PIN, as: "me" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.mode, "me");
    assert.ok(r.setCookie);
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Lax/);
    assert.match(r.setCookie, /Max-Age=2592000/);
    const session = await call(api, "GET", "/api/auth/session", { cookie: r.setCookie.split(";")[0] });
    assert.equal(session.body.mode, "me");
  });

  test("doctor PIN unlocks doctor mode", async () => {
    const cookie = await login(api, "doctor");
    const r = await call(api, "GET", "/api/auth/session", { cookie });
    assert.equal(r.body.mode, "doctor");
  });

  test("wrong PIN is rejected and sets no cookie", async () => {
    const r = await call(api, "POST", "/api/auth/unlock", { body: { pin: "000000", as: "me" } });
    assert.equal(r.status, 401);
    assert.equal(r.setCookie, null);
    assert.match(r.body.error, /4 tries left/);
  });

  test("each PIN only opens its own mode", async () => {
    const siteAsDoctor = await call(api, "POST", "/api/auth/unlock", { body: { pin: SITE_PIN, as: "doctor" } });
    assert.equal(siteAsDoctor.status, 401);
    const doctorAsMe = await call(api, "POST", "/api/auth/unlock", { body: { pin: DOCTOR_PIN, as: "me" } });
    assert.equal(doctorAsMe.status, 401);
  });

  test("a mode sent by the browser is ignored", async () => {
    // Doctor PIN plus a forged mode field: still only doctor (and the unknown field changes nothing).
    const r = await call(api, "POST", "/api/auth/unlock", { body: { pin: DOCTOR_PIN, as: "doctor", mode: "me" } });
    assert.equal(r.body.mode, "doctor");
    const cookie = r.setCookie!.split(";")[0];
    const write = await call(api, "PATCH", `/api/days/${(await call(api, "GET", "/api/auth/session")).body.today}`, {
      cookie,
      body: { pain: 3, mode: "me" },
    });
    assert.equal(write.status, 403);
  });

  test("malformed PINs and forged cookies get nothing", async () => {
    for (const pin of ["12345", "1234567", "abcdef", 111111, null]) {
      const r = await call(api, "POST", "/api/auth/unlock", { body: { pin, as: "me" }, ip: `10.1.1.${String(pin).length}` });
      assert.equal(r.status, 401, `pin ${pin}`);
    }
    const forged = await call(api, "GET", "/api/prescription", { cookie: "psj_session=" + "A".repeat(43) });
    assert.equal(forged.status, 401);
  });

  test("lock ends the session on the server", async () => {
    const cookie = await login(api, "me");
    const locked = await call(api, "POST", "/api/auth/lock", { cookie });
    assert.equal(locked.body.mode, "public");
    assert.match(locked.setCookie!, /Max-Age=0/);
    // Re-using the old cookie no longer works.
    const r = await call(api, "GET", "/api/prescription", { cookie });
    assert.equal(r.status, 401);
  });

  test("writes without the X-PSJ header are refused (CSRF guard)", async () => {
    const r = await call(api, "POST", "/api/auth/unlock", { body: { pin: SITE_PIN, as: "me" }, noCsrfHeader: true });
    assert.equal(r.status, 403);
  });
});
