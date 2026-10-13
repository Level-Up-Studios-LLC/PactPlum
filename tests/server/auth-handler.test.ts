import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invitations, members, session, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { parseEnv } from "@/lib/env";
import { type Auth, createAuth } from "@/server/auth/create-auth";
import type { Mailer, MailMessage } from "@/server/mail/mailer";
import { ensureOrganization } from "@/server/org/bootstrap";
import { createInvitation } from "@/server/org/invitations";
import { createTestDb } from "../helpers/test-db";

const BASE_URL = "http://localhost:3000";
const PASSWORD = "correct-horse-battery";

// The rate limiter keys on client IP and outlives an auth instance, so each test uses its own IP.
let ipCounter = 0;
let clientIp = "";

function fakeMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    configured: true,
    async send(message) {
      sent.push(message);
      return { messageId: "<test@example.com>" };
    },
  };
  return { sent, mailer };
}

function envFor({ smtp }: { smtp: boolean }) {
  return parseEnv({
    DATABASE_URL: "postgres://unused",
    BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789",
    BETTER_AUTH_URL: BASE_URL,
    ...(smtp && { SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "noreply@example.com" }),
  });
}

function post(auth: Auth, path: string, body: unknown) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": clientIp },
      body: JSON.stringify(body),
    }),
  );
}

function signUp(auth: Auth, email: string) {
  return post(auth, "/sign-up/email", { email, password: PASSWORD, name: "Test User" });
}

function linkIn(message: MailMessage): string {
  const match = message.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No link in email: ${message.text}`);
  return match[0];
}

async function roleOf(db: Db, email: string) {
  const [row] = await db
    .select({ role: members.role })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(eq(user.email, email));
  return row?.role ?? null;
}

describe("auth handler", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    clientIp = `10.0.0.${++ipCounter}`;
  });
  afterEach(async () => {
    await close();
  });

  describe("without SMTP", () => {
    it("makes the first sign-up the owner and refuses an uninvited second sign-up", async () => {
      const auth = createAuth({ db, env: envFor({ smtp: false }), mailer: fakeMailer().mailer });

      expect((await signUp(auth, "owner@acme.com")).status).toBe(200);
      expect(await roleOf(db, "owner@acme.com")).toBe("owner");

      const refused = await signUp(auth, "stranger@other.com");
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "NOT_INVITED" });
      expect(await db.select().from(user).where(eq(user.email, "stranger@other.com"))).toHaveLength(0);
    });

    it("revokes every session when the password is reset", async () => {
      const { sent, mailer } = fakeMailer();
      const auth = createAuth({ db, env: envFor({ smtp: false }), mailer });
      await signUp(auth, "owner@acme.com");
      await post(auth, "/sign-in/email", { email: "owner@acme.com", password: PASSWORD });
      const [owner] = await db.select().from(user).where(eq(user.email, "owner@acme.com"));
      expect((await db.select().from(session).where(eq(session.userId, owner.id))).length).toBeGreaterThan(0);

      await post(auth, "/request-password-reset", { email: "owner@acme.com", redirectTo: "/reset-password" });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      const token = new URL(linkIn(sent[0])).pathname.split("/").pop();

      const reset = await post(auth, "/reset-password", { token, newPassword: "a-brand-new-password" });
      expect(reset.status).toBe(200);
      expect(await db.select().from(session).where(eq(session.userId, owner.id))).toHaveLength(0);
    });
  });

  describe("with SMTP", () => {
    it("admits the owner only after the verification link is opened", async () => {
      const { sent, mailer } = fakeMailer();
      const auth = createAuth({ db, env: envFor({ smtp: true }), mailer });

      expect((await signUp(auth, "owner@acme.com")).status).toBe(200);
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].to).toBe("owner@acme.com");
      expect(await roleOf(db, "owner@acme.com")).toBeNull();

      await auth.handler(new Request(linkIn(sent[0]), { headers: { "x-forwarded-for": clientIp } }));
      expect(await roleOf(db, "owner@acme.com")).toBe("owner");
    });

    it("admits an invited teammate once verified and accepts the invitation", async () => {
      const { sent, mailer } = fakeMailer();
      const auth = createAuth({ db, env: envFor({ smtp: true }), mailer });
      await signUp(auth, "owner@acme.com");
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      await auth.handler(new Request(linkIn(sent[0]), { headers: { "x-forwarded-for": clientIp } }));

      const organizationId = await ensureOrganization(db);
      const [owner] = await db.select().from(user).where(eq(user.email, "owner@acme.com"));
      const ctx = { organizationId, userId: owner.id, role: "owner" as const };
      const { invitationId } = await createInvitation(db, ctx, { email: "jane@acme.com" });

      expect((await signUp(auth, "Jane@Acme.com")).status).toBe(200);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      expect(await roleOf(db, "jane@acme.com")).toBeNull();

      await auth.handler(new Request(linkIn(sent[1]), { headers: { "x-forwarded-for": clientIp } }));
      expect(await roleOf(db, "jane@acme.com")).toBe("member");
      const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
      expect(invitation.acceptedAt).not.toBeNull();
    });
  });
});
