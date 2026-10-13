import { getSchema, type JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { editorExtensions, FIELD_KINDS, FIELD_LABELS, type FieldKind } from "./extensions";

export type DocContent = JSONContent;

export const MAX_CONTENT_CHARS = 1_000_000;
// [Group.Name], for example [Client.Name].
export const VARIABLE_PATTERN = /\[([A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)\]/g;
export const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;

let cachedSchema: Schema | undefined;
function editorSchema(): Schema {
  cachedSchema ??= getSchema(editorExtensions);
  return cachedSchema;
}

export function emptyContent(title = ""): DocContent {
  const heading = title ? [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }] : [];
  return { type: "doc", content: [...heading, { type: "paragraph" }] };
}

function walk(node: DocContent, visit: (node: DocContent) => void): void {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

export type ContentField = { id: string; kind: FieldKind; role: string; required: boolean; label: string };

export function extractFields(content: DocContent): ContentField[] {
  const fields: ContentField[] = [];
  walk(content, (node) => {
    if (node.type !== "field") return;
    const attrs = node.attrs ?? {};
    fields.push({
      id: String(attrs.id ?? ""),
      kind: attrs.kind as FieldKind,
      role: String(attrs.role ?? ""),
      required: attrs.required !== false,
      label: String(attrs.label ?? ""),
    });
  });
  return fields;
}

export function fieldLabel(field: { kind: FieldKind; label: string }): string {
  return field.label || FIELD_LABELS[field.kind] || "Field";
}

export function countQuoteBlocks(content: DocContent): number {
  let count = 0;
  walk(content, (node) => {
    if (node.type === "quoteBlock") count++;
  });
  return count;
}

export function extractVariables(content: DocContent): string[] {
  const names = new Set<string>();
  walk(content, (node) => {
    if (node.type !== "text" || !node.text) return;
    for (const match of node.text.matchAll(VARIABLE_PATTERN)) names.add(match[1]);
  });
  return [...names];
}

export function resolveVariables(content: DocContent, values: Record<string, string>): DocContent {
  const copy = structuredClone(content);
  walk(copy, (node) => {
    if (node.type !== "text" || !node.text) return;
    node.text = node.text.replace(VARIABLE_PATTERN, (token, name: string) =>
      Object.hasOwn(values, name) ? values[name] : token,
    );
  });
  return copy;
}

type ContentCheck = { ok: true; content: DocContent } | { ok: false; error: string };

export function validateContent(input: unknown, roles: string[]): ContentCheck {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Document content is missing." };
  }
  if (JSON.stringify(input).length > MAX_CONTENT_CHARS) return { ok: false, error: "Document content is too large." };
  const content = input as DocContent;
  try {
    if (content.type !== "doc") throw new Error("root is not a doc");
    editorSchema().nodeFromJSON(content).check();
  } catch {
    return { ok: false, error: "Document content is not valid." };
  }
  if (countQuoteBlocks(content) > 1) return { ok: false, error: "A document can have only one pricing table." };

  const ids = new Set<string>();
  for (const field of extractFields(content)) {
    if (!(FIELD_KINDS as readonly string[]).includes(field.kind)) return { ok: false, error: "A field has an unknown type." };
    if (!field.id) return { ok: false, error: "Every field needs an id." };
    if (ids.has(field.id)) {
      return {
        ok: false,
        error: `The ${fieldLabel(field)} field for ${field.role} has a duplicate id. Delete it and insert the field again.`,
      };
    }
    ids.add(field.id);
    if (!roles.includes(field.role)) {
      return {
        ok: false,
        error: `The ${fieldLabel(field)} field uses the role "${field.role}", which is not one of this document's roles.`,
      };
    }
  }
  return { ok: true, content };
}
