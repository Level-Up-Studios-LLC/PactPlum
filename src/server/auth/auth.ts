import { db } from "@/db/client";
import { getEnv } from "@/lib/env";
import { createMailerFromEnv } from "@/server/mail/mailer";
import { createAuth } from "./create-auth";

const env = getEnv();

export const auth = createAuth({ db, env, mailer: createMailerFromEnv(env) });
