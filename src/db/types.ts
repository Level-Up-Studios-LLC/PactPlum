import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

// Shared by the runtime postgres driver and the PGlite test driver.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
