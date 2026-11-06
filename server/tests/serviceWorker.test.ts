import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { serviceWorkerMiddleware } from "../src/serviceWorker.js";

test("old and current worker URLs serve the current worker with no-store headers", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "noted-worker-"));
  const script = 'importScripts("/sw-push.js?v=new-release");';
  try {
    fs.writeFileSync(path.join(directory, "sw-abcdef123456.js"), script);
    const app = new Hono();
    app.use("/*", serviceWorkerMiddleware(directory));
    app.get("*", c => c.text("normal asset"));
    for (const url of ["/sw.js", "/sw-111111111111.js", "/sw-abcdef123456.js"]) {
      const response = await app.request(url);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type")!, /javascript/);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(await response.text(), script);
    }
    const handler = await app.request("/sw-push.js?v=new-release");
    assert.equal(await handler.text(), "normal asset", "the push handler must not be replaced by the main worker");
    assert.equal(handler.headers.get("cdn-cache-control"), "no-store");
    const asset = await app.request("/assets/index-hash.js");
    assert.equal(asset.headers.get("cache-control"), null, "hashed static assets remain cacheable");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
