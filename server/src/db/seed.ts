import { db, pool } from "./index.js";
import { spaces } from "./schema.js";
import { count } from "drizzle-orm";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

/**
 * Checks whether the database already has an initialized space.
 * Production startup does not seed hardcoded workspace or member data;
 * instead, first-run initialization is handled via the Setup Wizard (`POST /api/setup`).
 */
export async function ensureDefaultSeed() {
  const existingSpaces = await db.select({ value: count() }).from(spaces);
  if (existingSpaces[0].value > 0) {
    console.log("Workspace already initialized.");
    return;
  }
  console.log("No workspace initialized yet — awaiting First-Run Setup Wizard (/api/setup).");
}

if (process.argv[1] === __filename) {
  ensureDefaultSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Seed check failed:", err);
      await pool.end();
      process.exit(1);
    });
}
