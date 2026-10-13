import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { enabledSocialProviders, getEnv, requiresEmailVerification } from "@/lib/env";
import { createMailerFromEnv } from "@/server/mail/mailer";
import { resetPasswordEmail, verificationEmail } from "@/server/mail/templates";
import { normalizeEmail } from "@/server/org/invitations";
import { applySignUp, resolveSignUp } from "./signup-hooks";
import { SIGN_UP_MESSAGES } from "./signup-policy";

const env = getEnv();
const mailer = createMailerFromEnv(env);

function sendInBackground(promise: Promise<unknown>) {
  // Not awaited, so response timing does not reveal whether an account exists.
  promise.catch((error) => console.error("[auth] email failed:", error));
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: requiresEmailVerification(env),
    sendResetPassword: async ({ user, url }) => {
      sendInBackground(mailer.send({ to: user.email, ...resetPasswordEmail(url) }));
    },
  },
  emailVerification: {
    sendOnSignUp: requiresEmailVerification(env),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground(mailer.send({ to: user.email, ...verificationEmail(url) }));
    },
  },
  socialProviders: enabledSocialProviders(env),
  // Throttles sign-in, sign-up and reset attempts per IP.
  rateLimit: { enabled: true, window: 60, max: 30 },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const decision = await resolveSignUp(db, user.email);
          if (!decision.allowed) {
            throw new APIError("FORBIDDEN", { message: SIGN_UP_MESSAGES[decision.reason] });
          }
          return { data: { ...user, email: normalizeEmail(user.email) } };
        },
        after: async (user) => {
          await applySignUp(db, user.id, user.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
