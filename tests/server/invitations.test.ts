import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invitations, members } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { ensureOrganization } from "@/server/org/bootstrap";
import {
  createInvitation,
  findInvitationByToken,
  findPendingInvitationByEmail,
  hashToken,
  markInvitationAccepted,
} from "@/server/org/invitations";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let owner: OrgContext;
let member: OrgContext;

const now = new Date("2026-10-13T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const organizationId = await ensureOrganization(db, "Acme");
  const ownerId = await insertUser(db, "owner@acme.com");
  const memberId = await insertUser(db, "member@acme.com");
  await db.insert(members).values([
    { organizationId, userId: ownerId, role: "owner" },
    { organizationId, userId: memberId, role: "member" },
  ]);
  owner = { organizationId, userId: ownerId, role: "owner" };
  member = { organizationId, userId: memberId, role: "member" };
});
afterEach(async () => {
  await close();
});

describe("invitations", () => {
  it("stores only a hash of the token and normalizes the email", async () => {
    const created = await createInvitation(db, owner, { email: "  Jane@Acme.com " }, now);
    expect(created.email).toBe("jane@acme.com");
    expect(created.expiresAt.getTime()).toBe(now.getTime() + 7 * day);
    const [row] = await db.select().from(invitations);
    expect(row.tokenHash).toBe(hashToken(created.token));
    expect(row.tokenHash).not.toBe(created.token);
  });

  it("finds a pending invitation by email regardless of case", async () => {
    await createInvitation(db, owner, { email: "Jane@Acme.com" }, now);
    const found = await findPendingInvitationByEmail(db, owner.organizationId, "JANE@acme.COM", now);
    expect(found?.email).toBe("jane@acme.com");
  });

  it("finds an invitation by token until it expires", async () => {
    const { token } = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    expect(await findInvitationByToken(db, token, now)).not.toBeNull();
    expect(await findInvitationByToken(db, token, new Date(now.getTime() + 8 * day))).toBeNull();
    expect(await findInvitationByToken(db, "wrong-token", now)).toBeNull();
  });

  it("does not return an accepted invitation", async () => {
    const { token, invitationId } = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    await markInvitationAccepted(db, invitationId, now);
    expect(await findInvitationByToken(db, token, now)).toBeNull();
    expect(await findPendingInvitationByEmail(db, owner.organizationId, "jane@acme.com", now)).toBeNull();
  });

  it("markInvitationAccepted claims an invitation only once", async () => {
    const { invitationId } = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    expect(await markInvitationAccepted(db, invitationId, now)).toBe(true);
    expect(await markInvitationAccepted(db, invitationId, now)).toBe(false);
  });

  it("the database rejects a second pending invitation for the same email", async () => {
    const base = {
      organizationId: owner.organizationId,
      email: "jane@acme.com",
      invitedByUserId: owner.userId,
      expiresAt: new Date(now.getTime() + day),
    };
    await db.insert(invitations).values({ ...base, tokenHash: "hash-one" });
    await expect(db.insert(invitations).values({ ...base, tokenHash: "hash-two" })).rejects.toThrow();
  });

  it("replaces an earlier pending invitation for the same email", async () => {
    const first = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    const second = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    expect(await findInvitationByToken(db, first.token, now)).toBeNull();
    expect(await findInvitationByToken(db, second.token, now)).not.toBeNull();
  });

  it("refuses to invite an existing member", async () => {
    await expect(createInvitation(db, owner, { email: "Member@acme.com" }, now)).rejects.toThrow(ValidationError);
  });

  it("refuses an invalid email", async () => {
    await expect(createInvitation(db, owner, { email: "nope" }, now)).rejects.toThrow(ValidationError);
  });

  it("only the owner can invite", async () => {
    await expect(createInvitation(db, member, { email: "x@acme.com" }, now)).rejects.toThrow(ForbiddenError);
  });
});
