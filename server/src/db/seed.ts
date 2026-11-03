import { db, pool } from "./index.js";
import { spaces, members, tasks } from "./schema.js";
import { count } from "drizzle-orm";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

export async function ensureDefaultSeed() {
  const existingSpaces = await db.select({ value: count() }).from(spaces);
  if (existingSpaces[0].value > 0) {
    return;
  }

  console.log("Seeding initial household workspace, members, and sample tasks...");

  const [defaultSpace] = await db
    .insert(spaces)
    .values({
      name: "Our Home Hub",
    })
    .returning();

  const [issac, partner] = await db
    .insert(members)
    .values([
      {
        spaceId: defaultSpace.id,
        name: "Issac",
        avatar: "🧑‍💻",
        role: "owner",
      },
      {
        spaceId: defaultSpace.id,
        name: "Partner",
        avatar: "🌿",
        role: "member",
      },
    ])
    .returning();

  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await db.insert(tasks).values([
    {
      spaceId: defaultSpace.id,
      title: "Property Tax Installment",
      note: "Account #4491-8820 — municipal online portal",
      type: "critical",
      dueDate: threeDaysFromNow,
      assignedTo: issac.id,
      createdBy: issac.id,
      status: "pending",
    },
    {
      spaceId: defaultSpace.id,
      title: "Replace furnace air filter",
      note: "Filter dimension: 16x25x1 MERV 11",
      type: "daily",
      assignedTo: issac.id,
      createdBy: issac.id,
      status: "pending",
    },
    {
      spaceId: defaultSpace.id,
      title: "Pick up dry cleaning after work",
      note: "Receipt on kitchen counter",
      type: "daily",
      assignedTo: issac.id,
      createdBy: partner.id,
      status: "pending",
    },
    {
      spaceId: defaultSpace.id,
      title: "Pick up prescription",
      note: "Dosage 500mg — Shoppers Drug Mart",
      type: "daily",
      assignedTo: partner.id,
      createdBy: issac.id,
      status: "pending",
    },
  ]);

  console.log("Seed complete.");
}

if (process.argv[1] === __filename) {
  ensureDefaultSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Seed failed:", err);
      await pool.end();
      process.exit(1);
    });
}
