import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const migrationsFolder = path.resolve(__dirname, "../../drizzle");
  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
}

if (process.argv[1] === __filename) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Migration failed:", err);
      await pool.end();
      process.exit(1);
    });
}
