import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { addDays, postOp, todayIn } from "../../shared/postop.ts";
import { streaks, type DayStat } from "../src/routes/stats.ts";
import { call, login, resetDb, startApi, type Api } from "./helpers.ts";

const today = todayIn("Asia/Kolkata");
const week = postOp("2026-08-15", today).week;

function day(date: string, done: number, total: number): DayStat {
  return { date, day: 0, week: 1, pain: null, stiffness: null, swelling: null,
    flexion_deg: null, extension_deg: null, done, total, opened: total > 0 };
}

describe("Streaks", () => {
  const d = (n: number) => addDays("2026-11-01", n);

  test("counts days with at least half the exercises ticked", () => {
    const days = [day(d(0), 10, 10), day(d(1), 5, 10), day(d(2), 4, 10), day(d(3), 9, 10), day(d(4), 8, 10)];
    assert.deepEqual(streaks(days, d(4)), { current: 2, best: 2 });
  });

  test("an unfinished today doesn't break the streak", () => {
    const days = [day(d(0), 10, 10), day(d(1), 10, 10), day(d(2), 0, 10)];
    assert.deepEqual(streaks(days, d(2)), { current: 2, best: 2 });
  });

  test("days with nothing scheduled are skipped", () => {
    const days = [day(d(0), 10, 10), day(d(1), 0, 0), day(d(2), 10, 10)];
    assert.equal(streaks(days, d(2)).current, 2);
  });
});

describe("Stats API", () => {
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
    return d.body.items.filter((i: any) => i.kind === "exercise").length as number;
  }

  test("public sees the charts data; skipped days still count as scheduled", async () => {
    const yesterday = addDays(today, -2); // leave the day in between unopened
    const totalA = await logDay(yesterday, 3, { pain: 4, flexion_deg: 100 });
    const totalB = await logDay(today, 2, { pain: 2, flexion_deg: 110 });

    const r = await call(api, "GET", "/api/stats");
    assert.equal(r.status, 200);
    assert.equal(r.body.days.length, 3);
    const gap = r.body.days[1];
    assert.equal(gap.opened, false);
    assert.equal(gap.done, 0);
    assert.ok(gap.total >= 0);
    assert.deepEqual(r.body.days.map((x: any) => x.pain), [4, null, 2]);
    const done = r.body.weeks.reduce((a: number, w: any) => a + w.done, 0);
    assert.equal(done, 5);
    assert.ok(r.body.weeks.reduce((a: number, w: any) => a + w.total, 0) >= totalA + totalB);
  });

  test("weekly summary: private to me and the doctor, with angles and red flags", async () => {
    await logDay(today, 1, { pain: 3, flexion_deg: 115, extension_deg: -2, flag_giving_way: true, journal: "Wobbly" });
    assert.equal((await call(api, "GET", `/api/stats/weeks/${week}`)).status, 401);

    const r = await call(api, "GET", `/api/stats/weeks/${week}`, { cookie: doctor });
    assert.equal(r.status, 200);
    assert.equal(r.body.avgPain, 3);
    assert.equal(r.body.flexion.value, 115);
    assert.deepEqual(r.body.redFlags, [{ date: today, flags: ["Giving way"] }]);
    assert.equal(r.body.notes[0].journal, "Wobbly");
    assert.equal((await call(api, "GET", `/api/stats/weeks/${week + 1}`, { cookie: doctor })).status, 400);
  });

  test("doctor can comment on a week", async () => {
    const r = await call(api, "POST", "/api/comments", {
      cookie: doctor,
      body: { target_type: "week", target_key: String(week), body: "Good week overall" },
    });
    assert.equal(r.status, 201);
  });
});
