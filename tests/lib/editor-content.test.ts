import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  countQuoteBlocks,
  emptyContent,
  extractFields,
  extractVariables,
  resolveVariables,
  validateContent,
} from "@/lib/editor/content";

const text = (value: string): JSONContent => ({ type: "text", text: value });
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const field = (attrs: Record<string, unknown> = {}): JSONContent => ({
  type: "field",
  attrs: { id: "f1", kind: "signature", role: "Client", required: true, label: "", ...attrs },
});
const table: JSONContent = {
  type: "table",
  content: [
    { type: "tableRow", content: [{ type: "tableHeader", content: [p(text("Item"))] }, { type: "tableHeader", content: [p(text("Price"))] }] },
    { type: "tableRow", content: [{ type: "tableCell", content: [p(text("Design"))] }, { type: "tableCell", content: [p(text("1,000"))] }] },
  ],
};

describe("validateContent", () => {
  it("accepts headings, lists, tables, page breaks, a pricing table and fields", () => {
    const content = doc(
      { type: "heading", attrs: { level: 1 }, content: [text("Proposal")] },
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("One"))] }] },
      table,
      { type: "pageBreak" },
      { type: "quoteBlock" },
      p(text("Sign here: "), field(), text(" Date: "), field({ id: "f2", kind: "date" })),
    );
    expect(validateContent(content, ["Client"])).toEqual({ ok: true, content });
  });

  it("accepts the empty starter content", () => {
    expect(validateContent(emptyContent("Website redesign"), ["Client"]).ok).toBe(true);
  });

  it.each([
    [null, "Document content is missing."],
    ["<p>hi</p>", "Document content is missing."],
    [[], "Document content is missing."],
    [p(text("not a doc")), "Document content is not valid."],
    [doc({ type: "script", content: [text("alert(1)")] }), "Document content is not valid."],
    [doc(p({ type: "heading", attrs: { level: 1 }, content: [text("nested")] })), "Document content is not valid."],
    [doc({ type: "quoteBlock" }, { type: "quoteBlock" }), "A document can have only one pricing table."],
    [doc(p(field(), field())), "Every field needs a unique id."],
    [doc(p(field({ id: "" }))), "Every field needs a unique id."],
    [doc(p(field({ kind: "stamp" }))), "A field has an unknown type."],
    [doc(p(field({ role: "Witness" }))), 'The Signature field uses the role "Witness", which is not one of this document\'s roles.'],
  ])("rejects %j", (input, error) => {
    expect(validateContent(input, ["Client"])).toEqual({ ok: false, error });
  });

  it("rejects content larger than one megabyte", () => {
    const big = doc(p(text("x".repeat(1_000_001))));
    expect(validateContent(big, ["Client"])).toEqual({ ok: false, error: "Document content is too large." });
  });
});

describe("content helpers", () => {
  const content = doc(
    { type: "quoteBlock" },
    p(text("Hello [Client.Name], from [Sender.Name] for [Client.Name] and [Deal.Value].")),
    p(field({ id: "a", label: "Initials", kind: "text", required: false }), field({ id: "b", role: "Agency" })),
  );

  it("lists fields with their attributes", () => {
    expect(extractFields(content)).toEqual([
      { id: "a", kind: "text", role: "Client", required: false, label: "Initials" },
      { id: "b", kind: "signature", role: "Agency", required: true, label: "" },
    ]);
  });

  it("counts pricing table blocks", () => {
    expect(countQuoteBlocks(content)).toBe(1);
    expect(countQuoteBlocks(emptyContent())).toBe(0);
  });

  it("lists variables once each, in order of appearance", () => {
    expect(extractVariables(content)).toEqual(["Client.Name", "Sender.Name", "Deal.Value"]);
  });

  it("ignores bracketed text that is not a Group.Name variable", () => {
    expect(extractVariables(doc(p(text("[note] [Client] [1.2] [Client.Name.Extra]"))))).toEqual([]);
  });

  it("resolves known variables in a copy and leaves unknown ones", () => {
    const resolved = resolveVariables(content, { "Client.Name": "Jane", "Sender.Name": "Sam" });
    expect(resolved.content?.[1]).toEqual(p(text("Hello Jane, from Sam for Jane and [Deal.Value].")));
    expect(content.content?.[1]).toEqual(p(text("Hello [Client.Name], from [Sender.Name] for [Client.Name] and [Deal.Value].")));
  });
});
