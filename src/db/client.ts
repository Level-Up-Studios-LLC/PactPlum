import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
import type { Db } from "./types";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pactplumSql?: ReturnType<typeof postgres> };

const sql = globalForDb.pactplumSql ?? postgres(getEnv().DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pactplumSql = sql;

export const db: Db = drizzle({ client: sql, schema });
