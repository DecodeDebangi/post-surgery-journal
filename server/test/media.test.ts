import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { todayIn } from "../../shared/postop.ts";
import { driveFileId } from "../src/routes/media.ts";
import { presignUrl } from "../src/storage.ts";
import { call, login, resetDb, startApi, type Api } from "./helpers.ts";

const today = todayIn("Asia/Kolkata");
// Enough of a JPEG for the server's file-type check.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("test photo bytes")]);

describe("Storage signing", () => {
  test("matches AWS's published SigV4 presigned-URL example", () => {
    const url = presignUrl({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    assert.ok(url.endsWith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"));
  });

  test("reads Google Drive share links", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    assert.equal(driveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`), id);
    assert.equal(driveFileId(`https://drive.google.com/open?id=${id}`), id);
    assert.equal(driveFileId(`https://evil.example.com/file/d/${id}/view`), null);
    assert.equal(driveFileId("not a url"), null);
  });
});

describe("Photos, videos, milestones, timeline", () => {
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

  async function upload(cookie: string | null, body: Uint8Array, query = "", type = "image/jpeg") {
    const res = await fetch(`${api.base}/api/media/photos?date=${today}${query}`, {
      method: "POST",
      headers: { "X-PSJ": "1", "Content-Type": type, ...(cookie ? { Cookie: cookie } : {}) },
      body,
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  test("I upload a photo; it's served through the API and stored in the bucket", async () => {
    const r = await upload(me, JPEG, "&caption=First%20squat");
    assert.equal(r.status, 201);
    assert.equal(r.body.caption, "First squat");
    assert.equal(r.body.url, `/api/media/${r.body.id}/file`);

    const file = await fetch(api.base + r.body.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), JPEG);

    const day = await call(api, "GET", `/api/days/${today}`);
    assert.equal(day.body.media.length, 1);
  });

  test("private photos are hidden from the public, but not from the doctor", async () => {
    const r = await upload(me, JPEG, "&private=1");
    assert.equal(r.body.is_private, true);
    assert.equal((await fetch(api.base + r.body.url)).status, 404);
    assert.equal((await call(api, "GET", `/api/days/${today}`)).body.media.length, 0);

    const asDoctor = await fetch(api.base + r.body.url, { headers: { Cookie: doctor } });
    assert.equal(asDoctor.status, 200);
    assert.equal((await call(api, "GET", `/api/days/${today}`, { cookie: doctor })).body.media.length, 1);
  });

  test("only real images are accepted", async () => {
    const fake = new TextEncoder().encode("<script>alert(1)</script>");
    assert.equal((await upload(me, fake)).status, 400);
    assert.equal((await upload(me, JPEG, "", "text/html")).status, 400);
  });

  test("the doctor and the public can't upload, edit or delete media", async () => {
    assert.equal((await upload(doctor, JPEG)).status, 403);
    assert.equal((await upload(null, JPEG)).status, 401);
    const mine = await upload(me, JPEG);
    assert.equal((await call(api, "PATCH", `/api/media/${mine.body.id}`, { cookie: doctor, body: { caption: "x" } })).status, 403);
    assert.equal((await call(api, "DELETE", `/api/media/${mine.body.id}`, { cookie: doctor })).status, 403);
  });

  test("deleting a photo removes it from storage too", async () => {
    const r = await upload(me, JPEG);
    assert.equal((await call(api, "DELETE", `/api/media/${r.body.id}`, { cookie: me })).status, 200);
    assert.equal((await fetch(api.base + r.body.url, { headers: { Cookie: me } })).status, 404);
  });

  test("Drive video links are stored as a file id; bad links are refused", async () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    const ok = await call(api, "POST", "/api/media/videos", {
      cookie: me,
      body: { date: today, drive_url: `https://drive.google.com/file/d/${id}/view`, caption: "Step-downs" },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.drive_id, id);
    assert.equal(ok.body.url, null);

    const bad = await call(api, "POST", "/api/media/videos", {
      cookie: me,
      body: { date: today, drive_url: "https://youtube.com/watch?v=abc" },
    });
    assert.equal(bad.status, 400);
  });

  test("milestones: public can read, only I can add", async () => {
    const add = await call(api, "POST", "/api/milestones", {
      cookie: me,
      body: { date: today, title: "First stairs without the rail", emoji: "🪜" },
    });
    assert.equal(add.status, 201);
    const byDoctor = await call(api, "POST", "/api/milestones", { cookie: doctor, body: { date: today, title: "x" } });
    assert.equal(byDoctor.status, 403);
    const list = await call(api, "GET", "/api/milestones");
    assert.equal(list.body.milestones[0].title, "First stairs without the rail");
  });

  test("timeline: shows days with content; private parts only for me and the doctor", async () => {
    await call(api, "POST", `/api/days/${today}/ensure`, { cookie: me });
    // An empty, just-opened day doesn't show up.
    assert.equal((await call(api, "GET", "/api/timeline")).body.days.length, 0);

    await call(api, "PATCH", `/api/days/${today}`, {
      cookie: me,
      body: { pain: 2, journal: "Walked to the shop", flag_catching: true },
    });
    await upload(me, JPEG, "&private=1");
    await upload(me, JPEG);
    await call(api, "POST", "/api/comments", {
      cookie: doctor,
      body: { target_type: "day", target_key: today, body: "Watch the catching" },
    });

    const pub = await call(api, "GET", "/api/timeline");
    const [day] = pub.body.days;
    assert.equal(day.date, today);
    assert.equal(day.journal, "Walked to the shop");
    assert.equal(day.media.length, 1, "public sees only the non-private photo");
    assert.equal("red_flag" in day, false);
    assert.equal("comments" in day, false);

    const [full] = (await call(api, "GET", "/api/timeline", { cookie: doctor })).body.days;
    assert.equal(full.media.length, 2);
    assert.equal(full.red_flag, true);
    assert.equal(full.comments, 1);
  });

  test("clearing a day deletes its photos", async () => {
    await call(api, "POST", `/api/days/${today}/ensure`, { cookie: me });
    const r = await upload(me, JPEG);
    await call(api, "DELETE", `/api/days/${today}`, { cookie: me });
    assert.equal((await fetch(api.base + r.body.url, { headers: { Cookie: me } })).status, 404);
  });
});
