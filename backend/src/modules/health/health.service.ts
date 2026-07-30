import { sql } from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";

export type HealthResult =
  | { status: "ok"; checks: { db: "ok" } }
  | { status: "degraded"; checks: { db: "error" } };

const DB_CHECK_TIMEOUT_MS = 2_000;

export async function checkHealth(db: Database): Promise<HealthResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Database health check timed out")),
          DB_CHECK_TIMEOUT_MS,
        );
      }),
    ]);

    return { status: "ok", checks: { db: "ok" } };
  } catch {
    return { status: "degraded", checks: { db: "error" } };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
