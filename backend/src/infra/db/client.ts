import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    connect_timeout: 2,
  });

  return {
    db: drizzle(client),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
