import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invitations, members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { applySignUp, resolveSignUp } from "@/server/auth/signup-hooks";
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

  it("creates the organization and makes the first user owner", async () => {
    const userId = await insertUser(db, "owner@acme.com");
    expect(await applySignUp(db, userId, "owner@acme.com", now)).toBe("owner");
    expect(await db.select().from(organizations)).toHaveLength(1);
    const [membership] = await db.select().from(members);
    expect(membership.role).toBe("owner");
  });

  it("refuses an uninvited second user", async () => {
    const ownerId = await insertUser(db, "owner@acme.com");
    await applySignUp(db, ownerId, "owner@acme.com", now);
    expect(await resolveSignUp(db, "stranger@other.com", now)).toEqual({ allowed: false, reason: "not_invited" });
    const strangerId = await insertUser(db, "stranger@other.com");
    expect(await applySignUp(db, strangerId, "stranger@other.com", now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
  });

  it("admits an invited user signing up with different email casing and accepts the invitation", async () => {
    const ownerId = await insertUser(db, "owner@acme.com");
    await applySignUp(db, ownerId, "owner@acme.com", now);
    const organizationId = await ensureOrganization(db);
    await createInvitation(db, { organizationId, userId: ownerId, role: "owner" }, { email: "Jane@Acme.com" }, now);

    const janeId = await insertUser(db, "jane@acme.com");
    expect(await applySignUp(db, janeId, "JANE@acme.com", now)).toBe("member");
    const [invitation] = await db.select().from(invitations);
    expect(invitation.acceptedAt).toEqual(now);
  });

  it("returns null instead of throwing when the owner slot was taken concurrently", async () => {
    const organizationId = await ensureOrganization(db);
    const firstId = await insertUser(db, "first@acme.com");
    const secondId = await insertUser(db, "second@acme.com");
    // Simulate the race: the second request already decided "owner" before the first committed.
    await db.insert(members).values({ organizationId, userId: firstId, role: "owner" });
    const { applyDecision } = await import("@/server/auth/signup-hooks");
    expect(await applyDecision(db, organizationId, secondId, { allowed: true, role: "owner" }, now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
  });
});
