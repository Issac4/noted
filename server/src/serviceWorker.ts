import type { MiddlewareHandler } from "hono";
import fs from "node:fs";
import path from "node:path";

/** Keep old installed workers updateable when a release changes the worker filename. */
export function serviceWorkerMiddleware(clientDistPath: string): MiddlewareHandler {
  const worker = fs.readdirSync(clientDistPath).find(file => /^sw-[a-f0-9]+\.js$/.test(file));
  const script = worker ? fs.readFileSync(path.join(clientDistPath, worker), "utf8") : null;
  return async (c, next) => {
    const resource = c.req.path;
    const isWorker = /^\/sw(?:-[a-f0-9]+)?\.js$/.test(resource);
    if (isWorker || resource === "/sw-push.js" || resource === "/" || resource === "/index.html" || resource === "/manifest.webmanifest") {
      c.header("Cache-Control", "no-store, max-age=0");
      c.header("CDN-Cache-Control", "no-store");
    }
    if (isWorker && script !== null) {
      c.header("Content-Type", "text/javascript; charset=utf-8");
      return c.body(script);
    }
    await next();
  };
}
