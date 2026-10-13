import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { emptyContent } from "@/lib/editor/content";
import { emptyQuote } from "@/lib/quote/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "@/server/templates/templates";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, seedTwoOrganizations } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let a: OrgContext;
let aMember: OrgContext;
let b: OrgContext;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, aMember, b } = await seedTwoOrganizations(db));
});
afterEach(async () => {
  await close();
});

// Saves on top of the stored version, like a page that was just loaded.
async function save(ctx: OrgContext, id: string, input: object) {
  return updateTemplate(db, ctx, id, { ...input, version: (await getTemplate(db, a, id)).version });
}

const withField = (role = "Client"): JSONContent => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "field", attrs: { id: "f1", kind: "signature", role, required: true, label: "" } }] },
    { type: "quoteBlock" },
  ],
});
const pricedQuote = () => ({
  ...emptyQuote("USD"),
  sections: [{ id: "s1", title: "", kind: "standard", items: [{ id: "i1", name: "Design", price: 100000, qty: 1 }] }],
});

describe("templates", () => {
  it("lets a member create a template with starter content", async () => {
    const template = await createTemplate(db, aMember, { name: "Website proposal", documentType: "proposal" });
    expect(template).toMatchObject({
      organizationId: a.organizationId,
      name: "Website proposal",
      documentType: "proposal",
      roles: ["Client"],
      quote: null,
      paymentMode: "off",
      paymentPercent: null,
      createdByUserId: aMember.userId,
    });
    expect(template.content).toEqual(emptyContent("Website proposal"));
  });

  it("requires a name", async () => {
    await expect(createTemplate(db, a, { name: " " })).rejects.toThrow(new ValidationError("Name is required."));
  });

  it("saves content with fields, roles, a pricing table and payment settings", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    const saved = await save(a, template.id, {
      roles: ["Client", "Agency"],
      content: withField("Agency"),
      quote: pricedQuote(),
      paymentMode: "deposit_percent",
      paymentPercent: 30,
    });
    expect(saved.roles).toEqual(["Client", "Agency"]);
    expect(saved.quote?.sections[0].items[0]).toMatchObject({ name: "Design", price: 100000, optional: false });
    expect(saved).toMatchObject({ paymentMode: "deposit_percent", paymentPercent: 30 });
  });

  it.each([
    [{ content: { type: "doc", content: [{ type: "script" }] } }, "Document content is not valid."],
    [{ content: withField("Witness") }, 'The Signature field uses the role "Witness", which is not one of this document\'s roles.'],
    [{ roles: [] }, "Add at least one role."],
    [{ roles: ["Client", "client"] }, "Role names must be unique."],
    [{ quote: { ...emptyQuote("USD"), currency: "ABC" } }, "Unknown currency code."],
    [{ quote: { ...pricedQuote(), amountFormula: "price - 200000" } }, '"Design" has a negative amount.'],
    [{ paymentMode: "deposit_percent" }, "Enter a deposit percent between 1 and 100."],
    [{ paymentMode: "deposit_percent", paymentPercent: 0 }, "Enter a deposit percent between 1 and 100."],
  ])("rejects invalid updates %#", async (input, message) => {
    const template = await createTemplate(db, a, { name: "T" });
    await expect(save(a, template.id, input)).rejects.toThrow(new ValidationError(message));
  });

  it("saves on the current version and increments it", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    expect(template.version).toBe(1);
    const first = await updateTemplate(db, a, template.id, { version: 1, name: "First" });
    expect(first).toMatchObject({ name: "First", version: 2 });
    const second = await updateTemplate(db, a, template.id, { version: 2, name: "Second" });
    expect(second).toMatchObject({ name: "Second", version: 3 });
    expect((await getTemplate(db, a, template.id)).version).toBe(3);
  });

  it("refuses a stale version and changes nothing", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    const teammate = withField("Client");
    await updateTemplate(db, a, template.id, { version: 1, content: teammate });
    await expect(updateTemplate(db, aMember, template.id, { version: 1, name: "From an old page" })).rejects.toThrow(
      new ConflictError(
        "Someone else saved this template since you opened it. Reload the page to see their changes, then make your edits again.",
      ),
    );
    const stored = await getTemplate(db, a, template.id);
    expect(stored).toMatchObject({ name: "T", version: 2 });
    expect(stored.content).toEqual(teammate);
  });

  it("requires a positive integer version", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    for (const version of [undefined, 0, -1, 1.5, "1"]) {
      await expect(updateTemplate(db, a, template.id, { version, name: "X" })).rejects.toThrow(
        new ValidationError("Reload the page and try again."),
      );
    }
  });

  it("reports a missing template as not found, not as a conflict", async () => {
    await expect(updateTemplate(db, a, "missing", { version: 1, name: "X" })).rejects.toThrow(
      new NotFoundError("Template not found."),
    );
  });

  it("refuses to remove a role that a field still uses", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    await save(a, template.id, { content: withField("Client") });
    await expect(save(a, template.id, { roles: ["Agency"] })).rejects.toThrow(
      new ValidationError('The Signature field uses the role "Client", which is not one of this document\'s roles.'),
    );
  });

  it("clears the deposit percent when payment is not a deposit, and removes a pricing table with null", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    await save(a, template.id, { quote: pricedQuote(), paymentMode: "deposit_percent", paymentPercent: 40 });
    const saved = await save(a, template.id, { quote: null, paymentMode: "full", paymentPercent: 40 });
    expect(saved).toMatchObject({ quote: null, paymentMode: "full", paymentPercent: null });
  });

  it("duplicates and deletes templates and lists them by name", async () => {
    const template = await createTemplate(db, a, { name: "Beta" });
    await save(a, template.id, { content: withField(), quote: pricedQuote() });
    const copy = await duplicateTemplate(db, a, template.id);
    expect(copy).toMatchObject({ name: "Beta (copy)", content: withField(), roles: ["Client"] });
    expect(copy.id).not.toBe(template.id);
    await createTemplate(db, a, { name: "Alpha" });
    expect((await listTemplates(db, a)).map((t) => t.name)).toEqual(["Alpha", "Beta", "Beta (copy)"]);
    await deleteTemplate(db, a, copy.id);
    await expect(getTemplate(db, a, copy.id)).rejects.toThrow(NotFoundError);
  });

  it("hides one organization's templates from another", async () => {
    const template = await createTemplate(db, a, { name: "Private" });
    await expect(getTemplate(db, b, template.id)).rejects.toThrow(new NotFoundError("Template not found."));
    await expect(save(b, template.id, { name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(duplicateTemplate(db, b, template.id)).rejects.toThrow(NotFoundError);
    await expect(deleteTemplate(db, b, template.id)).rejects.toThrow(NotFoundError);
    expect(await listTemplates(db, b)).toEqual([]);
    expect((await getTemplate(db, a, template.id)).name).toBe("Private");
  });
});
