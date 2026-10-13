import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { members } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { ensureOrganization } from "@/server/org/bootstrap";
import { getOrganizationSettings, updateOrganizationSettings } from "@/server/org/settings";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let owner: OrgContext;
let member: OrgContext;

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

describe("organization settings", () => {
  it("normalizes and saves settings for the owner", async () => {
    const saved = await updateOrganizationSettings(db, owner, {
      name: "  Acme Ltd ",
      senderName: "Acme Proposals",
      replyToEmail: "Sales@Acme.com",
      allowedSignupDomains: [" Acme.com", "@partner.io", ""],
    });
    expect(saved.name).toBe("Acme Ltd");
    expect(saved.replyToEmail).toBe("sales@acme.com");
    expect(saved.allowedSignupDomains).toEqual(["acme.com", "partner.io"]);
    expect(await getOrganizationSettings(db, member)).toEqual(saved);
  });

  it("stores blank optional fields as null", async () => {
    const saved = await updateOrganizationSettings(db, owner, {
      name: "Acme",
      senderName: "",
      replyToEmail: "",
      allowedSignupDomains: [],
    });
    expect(saved.senderName).toBeNull();
    expect(saved.replyToEmail).toBeNull();
  });

  it("rejects an invalid domain with a readable message", async () => {
    await expect(
      updateOrganizationSettings(db, owner, { name: "Acme", allowedSignupDomains: ["not a domain"] }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses updates from a member", async () => {
    await expect(updateOrganizationSettings(db, member, { name: "Hacked" })).rejects.toThrow(ForbiddenError);
  });
});
