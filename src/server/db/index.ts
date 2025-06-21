import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

// Configure PostgreSQL connection with proper SSL handling for production
const connectionConfig = {
  ssl: env.NODE_ENV === "production" ? "require" : false,
  max: env.NODE_ENV === "production" ? 1 : 10, // Use single connection per Lambda in production
  idle_timeout: env.NODE_ENV === "production" ? 20 : 0,
  max_lifetime: env.NODE_ENV === "production" ? 60 * 30 : 0, // 30 minutes
} as const;

const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, connectionConfig);
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
