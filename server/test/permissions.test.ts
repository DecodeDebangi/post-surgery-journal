import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { todayIn } from "../../shared/postop.ts";
import { call, login, resetDb, startApi, type Api } from "./helpers.ts";

const today = todayIn("Asia/Kolkata");

describe("Access levels: public, me, doctor", () => {
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

  async function addMedicine(cookie: string) {
    const r = await call(api, "POST", "/api/prescription/medicines", {
      cookie,
      body: { name: "Painkiller", dose: "1 tablet", times: ["morning", "night"] },
    });
    assert.equal(r.status, 201);
    return r.body;
  }

  test("public can't see or change the prescription", async () => {
    assert.equal((await call(api, "GET", "/api/prescription")).status, 401);
    assert.equal((await call(api, "GET", "/api/prescription/history")).status, 401);
    const add = await call(api, "POST", "/api/prescription/exercises", {
      body: { name: "X", session: "core", days: [1] },
    });
    assert.equal(add.status, 401);
  });

  test("public can't write to a day", async () => {
    assert.equal((await call(api, "POST", `/api/days/${today}/ensure`)).status, 401);
    assert.equal((await call(api, "PATCH", `/api/days/${today}`, { body: { pain: 2 } })).status, 401);
    assert.equal((await call(api, "DELETE", `/api/days/${today}`)).status, 401);
  });

  test("public reads a day with red flags but without the prescription", async () => {
    await addMedicine(me);
    await call(api, "POST", `/api/days/${today}/ensure`, { cookie: me });
    await call(api, "PATCH", `/api/days/${today}`, {
      cookie: me,
      body: { pain: 3, journal: "Good day", flag_giving_way: true },
    });

    const pub = await call(api, "GET", `/api/days/${today}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.pain, 3);
    assert.equal(pub.body.journal, "Good day");
    assert.equal(pub.body.flag_giving_way, true, "red flags are visible without a PIN");
    assert.ok(pub.body.items.length > 0);
    assert.ok(pub.body.items.every((i: any) => i.kind === "exercise"), "medicines are private");
    for (const item of pub.body.items) {
      assert.deepEqual(Object.keys(item).sort(), ["actual", "done", "id", "kind", "name", "slot"]);
    }

    const full = await call(api, "GET", `/api/days/${today}`, { cookie: doctor });
    assert.equal(full.body.flag_giving_way, true);
    assert.ok(full.body.items.some((i: any) => i.kind === "medicine"));
  });

  test("doctor can read and edit the prescription; changes are signed 'doctor'", async () => {
    const list = await call(api, "GET", "/api/prescription", { cookie: doctor });
    assert.equal(list.status, 200);
    assert.equal(list.body.exercises.length, 29);

    const squat = list.body.exercises.find((e: any) => e.name === "Squats");
    const edit = await call(api, "PATCH", `/api/prescription/exercises/${squat.id}`, {
      cookie: doctor,
      body: { sets: "3", target: "10" },
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.target, "10");

    const med = await addMedicine(doctor);
    assert.equal(med.name, "Painkiller");

    const history = await call(api, "GET", "/api/prescription/history", { cookie: me });
    assert.equal(history.status, 200);
    assert.deepEqual(
      history.body.changes.map((c: any) => [c.item_type, c.action, c.changed_by]),
      [["medicine", "create", "doctor"], ["exercise", "update", "doctor"]],
    );
    assert.equal(history.body.changes[1].before.target, "");
    assert.equal(history.body.changes[1].after.target, "10");
  });

  test("my prescription changes are signed 'me', and changed_by can't be forged", async () => {
    const r = await call(api, "POST", "/api/prescription/exercises", {
      cookie: me,
      body: { name: "Wall sit", session: "morning", days: [1, 3, 5], changed_by: "doctor" },
    });
    assert.equal(r.status, 400, "unknown fields are rejected");
    const ok = await call(api, "POST", "/api/prescription/exercises", {
      cookie: me,
      body: { name: "Wall sit", session: "morning", days: [1, 3, 5] },
    });
    assert.equal(ok.status, 201);
    const history = await call(api, "GET", "/api/prescription/history", { cookie: me });
    assert.equal(history.body.changes[0].changed_by, "me");
  });

  test("doctor can't write or delete my logs", async () => {
    await call(api, "POST", `/api/days/${today}/ensure`, { cookie: me });
    assert.equal((await call(api, "POST", `/api/days/${today}/ensure`, { cookie: doctor })).status, 403);
    assert.equal((await call(api, "PATCH", `/api/days/${today}`, { cookie: doctor, body: { pain: 9 } })).status, 403);
    const day = await call(api, "GET", `/api/days/${today}`, { cookie: doctor });
    const itemId = day.body.items[0].id;
    const tick = await call(api, "PATCH", `/api/days/${today}/items/${itemId}`, { cookie: doctor, body: { done: true } });
    assert.equal(tick.status, 403);
    assert.equal((await call(api, "DELETE", `/api/days/${today}`, { cookie: doctor })).status, 403);
    assert.equal((await call(api, "GET", `/api/days/${today}`)).body.exists, true, "day still there");
  });

  test("me: today's checklist follows the prescription, and I can tick and delete", async () => {
    const day = await call(api, "POST", `/api/days/${today}/ensure`, { cookie: me });
    assert.equal(day.status, 200);
    const dow = new Date(today + "T00:00:00Z").getUTCDay();
    const expected = (await call(api, "GET", "/api/prescription", { cookie: me })).body.exercises.filter(
      (e: any) => e.active && e.days.includes(dow),
    ).length;
    assert.equal(day.body.items.length, expected);

    const item = day.body.items[0];
    const tick = await call(api, "PATCH", `/api/days/${today}/items/${item.id}`, {
      cookie: me,
      body: { done: true, actual: "12" },
    });
    assert.equal(tick.status, 200);
    assert.equal(tick.body.done, true);

    assert.equal((await call(api, "DELETE", `/api/days/${today}`, { cookie: me })).status, 200);
    assert.equal((await call(api, "GET", `/api/days/${today}`)).body.exists, false);
  });

  test("bad input is rejected with a clear 400", async () => {
    const r = await call(api, "PATCH", `/api/days/${today}`, { cookie: me, body: { pain: 11 } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /pain/);
    const future = await call(api, "PATCH", `/api/days/2099-01-01`, { cookie: me, body: { pain: 1 } });
    assert.equal(future.status, 400);
  });
});
