import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { enabledSocialProviders, getEnv, requiresEmailVerification } from "@/lib/env";
import { createMailerFromEnv } from "@/server/mail/mailer";
import { resetPasswordEmail, verificationEmail } from "@/server/mail/templates";
import { admitUser, beforeUserCreate } from "./signup-hooks";

const env = getEnv();
const mailer = createMailerFromEnv(env);
const admitOptions = { ownerRequiresVerification: requiresEmailVerification(env) };

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
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendInBackground(mailer.send({ to: user.email, ...resetPasswordEmail(url) }));
    },
  },
  emailVerification: {
    sendOnSignUp: requiresEmailVerification(env),
    // Only consulted when verification is required: an unverified user (including the pending
    // first owner) gets a fresh link by trying to sign in.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground(mailer.send({ to: user.email, ...verificationEmail(url) }));
    },
  },
  socialProviders: enabledSocialProviders(env),
  // Enables Better Auth's built-in rate limiter.
  rateLimit: { enabled: true, window: 60, max: 30 },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: { ...user, ...(await beforeUserCreate(db, user)) } }),
        after: async (user) => {
          await admitUser(db, user, admitOptions);
        },
      },
      update: {
        // Fires when email verification flips emailVerified.
        after: async (user) => {
          await admitUser(db, user, admitOptions);
        },
      },
    },
    session: {
      create: {
        // Covers social sign-in and users who were invited after their account existed.
        after: async (session) => {
          const [row] = await db
            .select({ id: schema.user.id, email: schema.user.email, emailVerified: schema.user.emailVerified })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .limit(1);
          if (row) await admitUser(db, row, admitOptions);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
