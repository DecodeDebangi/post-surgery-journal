import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayIn } from "../../shared/postop.ts";
import { dayStatus } from "../../shared/status.ts";
import { call, login, resetDb, startApi, type Api } from "./helpers.ts";

const today = todayIn("Asia/Kolkata");

describe("Day status rule", () => {
  test("on track at 80% or more, partial below, not logged when empty", () => {
    assert.equal(dayStatus({ done: 8, total: 10, logged: true }), "on_track");
    assert.equal(dayStatus({ done: 7, total: 10, logged: true }), "partial");
    assert.equal(dayStatus({ done: 0, total: 10, logged: true }), "partial");
    assert.equal(dayStatus({ done: 0, total: 10, logged: false }), "not_logged");
    assert.equal(dayStatus({ done: 0, total: 0, logged: true }), "on_track");
  });
});

describe("Overview API", () => {
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

  async function logDay(date: string, ticks: number, fields: Record<string, unknown>) {
    const d = await call(api, "POST", `/api/days/${date}/ensure`, { cookie: me });
    for (const item of d.body.items.filter((i: any) => i.kind === "exercise").slice(0, ticks)) {
      await call(api, "PATCH", `/api/days/${date}/items/${item.id}`, { cookie: me, body: { done: true } });
    }
    await call(api, "PATCH", `/api/days/${date}`, { cookie: me, body: fields });
  }

  test("public sees it, red flags and comment counts included", async () => {
    await logDay(today, 1, { pain: 4, flag_giving_way: true });
    await call(api, "POST", "/api/comments", {
      cookie: doctor,
      body: { target_type: "day", target_key: today, body: "Call me" },
    });
    const pub = await call(api, "GET", "/api/overview");
    assert.equal(pub.status, 200);
    assert.deepEqual(pub.body.redFlags, [{ date: today, flags: ["Giving way"] }]);
    assert.equal(pub.body.todayDay.comments, 1);
    assert.equal(pub.body.todayDay.pain, 4);

    const full = await call(api, "GET", "/api/overview", { cookie: doctor });
    assert.deepEqual(full.body.todayDay.flags, ["Giving way"]);
    assert.equal(full.body.todayDay.comments, 1);
  });

  test("missed days show as not logged; values compare with last time", async () => {
    const earlier = addDays(today, -3);
    await logDay(earlier, 1, { pain: 3, flexion_deg: 110, flag_catching: true });
    await logDay(today, 99, { pain: 1 });
    // A day opened but left empty still counts as not logged.
    await call(api, "POST", `/api/days/${addDays(today, -1)}/ensure`, { cookie: me });

    const r = await call(api, "GET", "/api/overview", { cookie: doctor });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.days.map((d: any) => d.status), ["partial", "not_logged", "not_logged", "on_track"]);
    assert.equal(r.body.days[0].date, earlier, "starts at the first logged day");
    assert.equal(r.body.loggedToday, true);
    assert.equal(r.body.previous.pain.value, 3);
    assert.equal(r.body.latest.flexion_deg.value, 110);
    assert.deepEqual(r.body.redFlags, [{ date: earlier, flags: ["Catching"] }]);
  });

  test("today not logged yet", async () => {
    await logDay(addDays(today, -1), 2, { pain: 2 });
    const r = await call(api, "GET", "/api/overview", { cookie: me });
    assert.equal(r.body.loggedToday, false);
    assert.equal(r.body.lastLogged, addDays(today, -1));
  });
});
