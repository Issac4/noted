import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import "dotenv/config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://todo_admin:todo_password@localhost:5432/family_todo",
});

export const db = drizzle(pool, { schema });
