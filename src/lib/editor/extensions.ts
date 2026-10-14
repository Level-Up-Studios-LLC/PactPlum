import { type Extensions, mergeAttributes, Node } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { newId } from "@/lib/ids";

// One node set for the browser editor and for server-side content validation.

export const FIELD_KINDS = ["signature", "date", "text", "checkbox"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_LABELS: Record<FieldKind, string> = {
  signature: "Signature",
  date: "Date",
  text: "Text",
  checkbox: "Checkbox",
};

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "page-break", class: "pp-page-break" })];
  },
});

export const QuoteBlock = Node.create({
  name: "quoteBlock",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="quote-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "quote-block", class: "pp-quote-block" }), "Pricing table"];
  },
});

const dataAttribute = (name: string, fallback: unknown) => ({
  default: fallback,
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`),
  renderHTML: (attributes: Record<string, unknown>) => ({ [`data-${name}`]: String(attributes[name] ?? "") }),
});

export const Field = Node.create({
  name: "field",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: null,
        // Stored content loads from JSON, so HTML parsing only happens for paste: a pasted field gets a fresh id.
        parseHTML: () => newId(),
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-id": String(attributes.id ?? "") }),
      },
      kind: dataAttribute("kind", "signature"),
      role: dataAttribute("role", "Client"),
      label: dataAttribute("label", ""),
      required: {
        default: true,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-required") !== "false",
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-required": String(attributes.required) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="field"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind as FieldKind;
    const name = node.attrs.label || FIELD_LABELS[kind] || "Field";
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "field", class: "pp-field" }), `${name} · ${node.attrs.role}`];
  },
});

export const editorExtensions: Extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TableKit.configure({ table: { resizable: false } }),
  PageBreak,
  QuoteBlock,
  Field,
];
