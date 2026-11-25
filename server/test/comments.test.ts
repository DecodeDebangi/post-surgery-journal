import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { todayIn } from "../../shared/postop.ts";
import { call, login, resetDb, startApi, type Api } from "./helpers.ts";

const today = todayIn("Asia/Kolkata");

describe("Doctor comments", () => {
  let api: Api;
  let me: string;
  let doctor: string;

  before(async () => {
    api = await startApi();
  });
  after(() => api.close());
  beforeEach(async () => {
    await resetDb();
    me = await login(api, "me");
    doctor = await login(api, "doctor");
  });

  const post = (cookie: string | null, body: Record<string, unknown>) =>
    call(api, "POST", "/api/comments", { cookie, body: { target_type: "day", target_key: today, ...body } });

  test("doctor comments on a day; author comes from the session", async () => {
    const r = await post(doctor, { body: "Hold the lunges this week", about: "Lunges" });
    assert.equal(r.status, 201);
    assert.equal(r.body.author, "doctor");
    assert.equal(r.body.about, "Lunges");

    const forged = await post(doctor, { body: "x", author: "me" });
    assert.equal(forged.status, 400, "author can't be sent");
  });

  test("public can read comments but not write or mark them read", async () => {
    await post(doctor, { body: "Keep icing after walks" });
    const read = await call(api, "GET", `/api/comments?type=day&key=${today}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.comments[0].body, "Keep icing after walks");
    assert.equal((await post(null, { body: "spam" })).status, 401);
    assert.equal((await call(api, "POST", "/api/comments/read", { body: { type: "day", key: today } })).status, 401);
    await call(api, "POST", "/api/comments", {
      cookie: doctor,
      body: { target_type: "plan", target_key: "current", body: "Started a new medicine" },
    });
    assert.equal((await call(api, "GET", "/api/comments?type=plan&key=current")).status, 401, "plan notes need a PIN");
    const inbox = await call(api, "GET", "/api/comments/inbox");
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.unread, 0, "no unread badge without a PIN");
    assert.ok(inbox.body.comments.every((c: any) => c.target_type !== "plan"));
  });

  test("threads: one level of replies on the same target", async () => {
    const top = await post(doctor, { body: "How is the swelling after step-downs?" });
    const reply = await post(me, { body: "Mild, gone by evening", parent_id: top.body.id });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.author, "me");

    const nested = await post(doctor, { body: "ok", parent_id: reply.body.id });
    assert.equal(nested.status, 400);
    const otherDay = await call(api, "POST", "/api/comments", {
      cookie: me,
      body: { target_type: "day", target_key: "2026-08-20", body: "x", parent_id: top.body.id },
    });
    assert.equal(otherDay.status, 400);

    const thread = await call(api, "GET", `/api/comments?type=day&key=${today}`, { cookie: me });
    assert.deepEqual(thread.body.comments.map((c: any) => c.author), ["doctor", "me"]);
  });

  test("unread badge counts only the other person's comments, until read", async () => {
    await post(doctor, { body: "One" });
    await call(api, "POST", "/api/comments", {
      cookie: doctor,
      body: { target_type: "plan", target_key: "current", body: "Added a medicine" },
    });
    await post(me, { body: "My own note" });

    assert.equal((await call(api, "GET", "/api/comments/inbox", { cookie: me })).body.unread, 2);
    assert.equal((await call(api, "GET", "/api/comments/inbox", { cookie: doctor })).body.unread, 1);

    await call(api, "POST", "/api/comments/read", { cookie: me, body: { type: "day", key: today } });
    assert.equal((await call(api, "GET", "/api/comments/inbox", { cookie: me })).body.unread, 1);
    // Reading as me doesn't mark my own comment as read for the doctor.
    assert.equal((await call(api, "GET", "/api/comments/inbox", { cookie: doctor })).body.unread, 1);
  });

  test("bad targets are rejected", async () => {
    const r = await call(api, "POST", "/api/comments", {
      cookie: doctor,
      body: { target_type: "day", target_key: "not-a-date", body: "x" },
    });
    assert.equal(r.status, 400);
  });
});
