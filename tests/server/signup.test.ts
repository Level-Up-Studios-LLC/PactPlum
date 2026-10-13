import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invitations, members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { admitUser, applyDecision, beforeUserCreate, resolveSignUp } from "@/server/auth/signup-hooks";
import { decideSignUp, SIGN_UP_MESSAGES } from "@/server/auth/signup-policy";
import { ensureOrganization } from "@/server/org/bootstrap";
import { createInvitation } from "@/server/org/invitations";
import { createTestDb, insertUser } from "../helpers/test-db";

describe("decideSignUp", () => {
  const base = { hasOwner: true, invitation: null, allowedDomains: [] as string[] };

  it("makes the first user the owner", () => {
    expect(decideSignUp({ ...base, email: "a@acme.com", hasOwner: false })).toEqual({ allowed: true, role: "owner" });
  });

  it("refuses a provider that returned no email", () => {
    expect(decideSignUp({ ...base, email: "" })).toEqual({ allowed: false, reason: "missing_email" });
    expect(SIGN_UP_MESSAGES.missing_email).toMatch(/did not share a verified email/);
  });

  it("admits an invited user as member", () => {
    expect(decideSignUp({ ...base, email: "jane@acme.com", invitation: { id: "inv1" } })).toEqual({
      allowed: true,
      role: "member",
      invitationId: "inv1",
    });
  });

  it("admits an allowed domain regardless of case", () => {
    expect(decideSignUp({ ...base, email: "Jane@ACME.com", allowedDomains: ["acme.com"] })).toEqual({
      allowed: true,
      role: "member",
    });
  });

  it("refuses everyone else as invite-only", () => {
    expect(decideSignUp({ ...base, email: "x@other.com", allowedDomains: ["acme.com"] })).toEqual({
      allowed: false,
      reason: "not_invited",
    });
    expect(SIGN_UP_MESSAGES.not_invited).toBe(
      "This PactPlum workspace is invite-only. Ask the owner for an invitation.",
    );
  });
});

describe("sign-up hooks", () => {
  let db: Db;
  let close: () => Promise<void>;
  const now = new Date("2026-10-13T12:00:00Z");

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  async function bootstrapOwner() {
    const ownerId = await insertUser(db, "owner@acme.com");
    const role = await admitUser(db, { id: ownerId, email: "owner@acme.com", emailVerified: true }, now);
    expect(role).toBe("owner");
    return { ownerId, organizationId: await ensureOrganization(db) };
  }

  it("creates the organization and makes the first user owner", async () => {
    const userId = await insertUser(db, "owner@acme.com");
    expect(await admitUser(db, { id: userId, email: "owner@acme.com", emailVerified: true }, now)).toBe("owner");
    expect(await db.select().from(organizations)).toHaveLength(1);
    const [membership] = await db.select().from(members);
    expect(membership.role).toBe("owner");
  });

  it("lets the first user bootstrap as owner without a verified email", async () => {
    const userId = await insertUser(db, "owner@acme.com");
    expect(await admitUser(db, { id: userId, email: "owner@acme.com", emailVerified: false }, now)).toBe("owner");
  });

  it("refuses an uninvited second user", async () => {
    await bootstrapOwner();
    expect(await resolveSignUp(db, "stranger@other.com", now)).toEqual({ allowed: false, reason: "not_invited" });
    const strangerId = await insertUser(db, "stranger@other.com");
    expect(await admitUser(db, { id: strangerId, email: "stranger@other.com", emailVerified: true }, now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
  });

  it("does not admit an unverified invitee and keeps the invitation pending", async () => {
    const { ownerId, organizationId } = await bootstrapOwner();
    await createInvitation(db, { organizationId, userId: ownerId, role: "owner" }, { email: "Jane@Acme.com" }, now);
    const janeId = await insertUser(db, "jane@acme.com");

    expect(await admitUser(db, { id: janeId, email: "jane@acme.com", emailVerified: false }, now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
    const [invitation] = await db.select().from(invitations);
    expect(invitation.acceptedAt).toBeNull();
  });

  it("admits the same invitee once verified, with different casing, and accepts the invitation", async () => {
    const { ownerId, organizationId } = await bootstrapOwner();
    await createInvitation(db, { organizationId, userId: ownerId, role: "owner" }, { email: "Jane@Acme.com" }, now);
    const janeId = await insertUser(db, "jane@acme.com");

    expect(await admitUser(db, { id: janeId, email: "jane@acme.com", emailVerified: false }, now)).toBeNull();
    expect(await admitUser(db, { id: janeId, email: "JANE@acme.com", emailVerified: true }, now)).toBe("member");
    const [invitation] = await db.select().from(invitations);
    expect(invitation.acceptedAt).toEqual(now);
  });

  it("admits an allowed-domain user only once verified", async () => {
    const { organizationId } = await bootstrapOwner();
    await db
      .update(organizations)
      .set({ allowedSignupDomains: ["acme.com"] })
      .where(eq(organizations.id, organizationId));
    const userId = await insertUser(db, "dana@acme.com");

    expect(await admitUser(db, { id: userId, email: "dana@acme.com", emailVerified: false }, now)).toBeNull();
    expect(await admitUser(db, { id: userId, email: "dana@acme.com", emailVerified: true }, now)).toBe("member");
  });

  it("is idempotent for an already admitted user", async () => {
    const { ownerId } = await bootstrapOwner();
    const owner = { id: ownerId, email: "owner@acme.com", emailVerified: true };
    expect(await admitUser(db, owner, now)).toBe("owner");
    expect(await admitUser(db, owner, now)).toBe("owner");
    expect(await db.select().from(members)).toHaveLength(1);
  });

  it("admits an existing member-less user who is invited later", async () => {
    const { ownerId, organizationId } = await bootstrapOwner();
    const lateId = await insertUser(db, "late@acme.com");
    const late = { id: lateId, email: "late@acme.com", emailVerified: true };
    expect(await admitUser(db, late, now)).toBeNull();

    await createInvitation(db, { organizationId, userId: ownerId, role: "owner" }, { email: "late@acme.com" }, now);
    expect(await admitUser(db, late, now)).toBe("member");
    expect(await db.select().from(members)).toHaveLength(2);
  });

  it("returns null instead of throwing when the owner slot was taken concurrently", async () => {
    const organizationId = await ensureOrganization(db);
    const firstId = await insertUser(db, "first@acme.com");
    const secondId = await insertUser(db, "second@acme.com");
    // Simulate the race: the second request already decided "owner" before the first committed.
    await db.insert(members).values({ organizationId, userId: firstId, role: "owner" });
    expect(await applyDecision(db, organizationId, secondId, { allowed: true, role: "owner" }, now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
  });
});

describe("beforeUserCreate", () => {
  let db: Db;
  let close: () => Promise<void>;
  const now = new Date("2026-10-13T12:00:00Z");

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  it("rejects an uninvited email with a coded FORBIDDEN APIError", async () => {
    const ownerId = await insertUser(db, "owner@acme.com");
    await admitUser(db, { id: ownerId, email: "owner@acme.com", emailVerified: true }, now);

    const error = await beforeUserCreate(db, { email: "stranger@other.com" }, now).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIError);
    const apiError = error as APIError;
    expect(apiError.status).toBe("FORBIDDEN");
    expect(apiError.body).toMatchObject({ code: "NOT_INVITED", message: SIGN_UP_MESSAGES.not_invited });
  });

  it("rejects an empty email as MISSING_EMAIL", async () => {
    const error = await beforeUserCreate(db, { email: "" }, now).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).body).toMatchObject({ code: "MISSING_EMAIL" });
  });

  it("returns the lowercased email for an invited user", async () => {
    const ownerId = await insertUser(db, "owner@acme.com");
    await admitUser(db, { id: ownerId, email: "owner@acme.com", emailVerified: true }, now);
    const organizationId = await ensureOrganization(db);
    await createInvitation(db, { organizationId, userId: ownerId, role: "owner" }, { email: "jane@acme.com" }, now);

    expect(await beforeUserCreate(db, { email: " Jane@ACME.com " }, now)).toEqual({ email: "jane@acme.com" });
  });
});

