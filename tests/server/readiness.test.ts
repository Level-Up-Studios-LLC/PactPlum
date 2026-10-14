import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { emptyQuote, type Quote, safeParseQuote } from "@/lib/quote/schema";
import { checkSendReadiness, type ReadinessInput } from "@/server/documents/readiness";

const quote = (input: Record<string, unknown> = {}): Quote => {
  const result = safeParseQuote({
    ...emptyQuote("USD"),
    sections: [{ id: "s1", title: "", kind: "standard", items: [{ id: "i1", name: "Design", price: 1000, qty: 1 }] }],
    ...input,
  });
  if (!result.ok) throw new Error(result.error);
  return result.quote;
};
const content = (...nodes: JSONContent[]): JSONContent => ({ type: "doc", content: nodes });
const signature: JSONContent = {
  type: "paragraph",
  content: [{ type: "field", attrs: { id: "f1", kind: "signature", role: "Client", required: true, label: "" } }],
};
const greeting: JSONContent = { type: "paragraph", content: [{ type: "text", text: "Dear [Client.Name]," }] };

const ready: ReadinessInput = {
  type: "proposal",
  content: content(greeting, { type: "quoteBlock" }, signature),
  quote: quote(),
  recipients: [{ role: "Client", kind: "signer" }],
  variableValues: { "Client.Name": "Jane" },
};

describe("checkSendReadiness", () => {
  it("returns no problems for a complete document", () => {
    expect(checkSendReadiness(ready)).toEqual([]);
  });

  it("requires a recipient and a signer for every field role", () => {
    expect(checkSendReadiness({ ...ready, recipients: [] })).toEqual([
      "Add at least one recipient.",
      "Fields for the Client role have no signer. Add a signer with that role.",
    ]);
    expect(checkSendReadiness({ ...ready, recipients: [{ role: null, kind: "cc" }] })).toEqual([
      "Add at least one signer.",
      "Fields for the Client role have no signer. Add a signer with that role.",
    ]);
  });

  it("lets an invoice go to a copy recipient without signers", () => {
    const invoice = { ...ready, type: "invoice" as const, content: content({ type: "quoteBlock" }), recipients: [{ role: null, kind: "cc" as const }] };
    expect(checkSendReadiness(invoice)).toEqual([]);
  });

  it("reports variables without a value", () => {
    expect(checkSendReadiness({ ...ready, variableValues: {} })).toEqual(["The variable [Client.Name] has no value."]);
  });

  it("checks that the pricing table and its block go together", () => {
    expect(checkSendReadiness({ ...ready, quote: null })).toEqual([
      "The content has a pricing table block but the document has no pricing table.",
    ]);
    expect(checkSendReadiness({ ...ready, content: content(greeting, signature) })).toEqual([
      "Insert the pricing table block where the pricing table should appear.",
    ]);
  });

  it("requires a choice in every multichoice section", () => {
    const multichoice = quote({
      sections: [
        { id: "m", title: "Hosting", kind: "multichoice", items: [{ id: "a", name: "Basic", price: 100, qty: 1, selected: false }] },
      ],
    });
    expect(checkSendReadiness({ ...ready, quote: multichoice })).toEqual(['Choose an option in the section "Hosting".']);
  });

  it("requires an invoice total above zero", () => {
    const invoice = { ...ready, type: "invoice" as const };
    expect(checkSendReadiness({ ...invoice, quote: quote({ sections: [] }) })).toEqual(["An invoice needs a total above zero."]);
    expect(checkSendReadiness({ ...invoice, quote: null, content: content(greeting, signature) })).toEqual([
      "An invoice needs a pricing table with a total above zero.",
    ]);
  });
});
