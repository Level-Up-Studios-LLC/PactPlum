# PactPlum Plan 2: Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can manage contacts and a product catalog, build templates in a block editor with a pricing table, and create draft documents (proposal, quote, contract, invoice) from a template for a contact, with server-computed totals, document numbers, recipients and a send-readiness check.

**Architecture:** Pure, framework-free units under `src/lib/` (money, quote engine, editor schema and content helpers, document types) run in both the browser (live totals, editor) and the server (validation, totals). Tenant-scoped services under `src/server/` take a `Db` and an `OrgContext`, validate with Zod, and are tested against PGlite. Pages and server actions under `src/app/app/` are thin wrappers that call `requireMember()` first. The editor is TipTap 3; its node set is defined once and used both by the React editor and by server-side content validation through `getSchema`.

**Tech Stack:** Next.js 16.4, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM 0.45 + drizzle-kit 0.31, PGlite (tests), Zod 4, Vitest 5, TipTap 3.31.3 (`@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table`).

**Spec:** `docs/superpowers/specs/2026-10-12-proposal-app-design.md` (sections 4, 5, 8, 12, 13). Binding follow-ups: `docs/superpowers/plans/2026-10-13-pactplum-plan-1-followups.md` ("Binding rules for Plan 2 onward").

**Plan series (Phase 1):** Plan 1 Foundation (done, 0.1.0) → **Plan 2 Content (this, 0.2.0)** → Plan 3 Send and sign → Plan 4 Payments.

## Global Constraints

- License: MIT. Copyright holder: Level Up Studios LLC.
- No third-party product names, branding or captured research data in any repository file, comment, commit message or test. The product name is PactPlum.
- No telemetry.
- Every page, server action and route handler under `src/app/app/` calls `requireMember()` itself, first. A layout check does not protect pages or actions.
- Every tenant-owned table carries `organization_id`. Every tenant query receives an `OrgContext` and filters by `ctx.organizationId`, including lookups by id. A row from another organization is reported as not found, never as forbidden.
- Money is stored as integer minor units plus an ISO 4217 currency code. Totals are computed on the server; client input never sets an amount or total.
- Email addresses are stored and compared lowercased and trimmed.
- Document statuses: `draft, sent, viewed, completed, waiting_pay, paid, declined, voided`. The UI label for `voided` is "Expired".
- Document types: `proposal, quote, contract, invoice`.
- Variables use the `[Group.Name]` form, for example `[Client.Name]`.
- Roles for members: `owner | member`. All content features in this plan are available to every member (not owner-only).
- TipTap packages are pinned to the exact version `3.31.3` (no caret). Do not upgrade them in this plan.
- Do not modify files under `src/server/auth/` in this plan.
- New code paths stay outside the Greptile Plus globs unless they are security-sensitive (`**/auth/**`, `**/payments/**`, `**/billing/**`, `**/signing/**`, `**/audit/**`, `**/tenancy.ts`, `**/invitations.ts`, `drizzle/**`). The migration in Task 5 lands in `drizzle/` and is expected to raise the review tier.
- Commit messages end with the session's attribution lines.

## Review Focus

1. A quote in a zero-decimal currency (JPY) or a three-decimal currency (BHD) → amounts are not scaled by 100; "1250" yen stays 1250 minor units. Tests: Task 1 `parseMoney`/`currencyExponent`; Task 2 JPY totals.
2. A formula containing `constructor`, `process.exit()`, `__proto__`, division by zero or 40 nested parentheses → a readable error; no code runs and nothing crashes. Tests: Task 1 formula errors; Task 2 division by zero in a line.
3. Two documents of the same type created at the same moment → distinct, sequential numbers. Test: Task 11 concurrent `createDocument`.
4. A member of organization B opens or edits organization A's contact, product, template or document by id → not found, and nothing changes. Tests: Tasks 6, 7, 8, 11, 12 cross-organization cases.
5. An optional row the client did not select, or a multichoice section with nothing chosen → excluded from totals, and the send-readiness check reports the empty multichoice section. Tests: Task 2 optional and multichoice totals; Task 12 readiness.

## Rulings made while writing this plan

- **Quote storage:** the quote is stored as validated JSONB on `templates.quote` and `documents.quote`, not in separate tables. It is always read and written whole and Plan 3 freezes it into revisions. Cost if wrong: line items cannot be queried in SQL.
- **Discounts and tax:** each line may have a discount (percent or absolute). The quote has one optional discount and one optional tax, each percent or absolute. Tax applies to the subtotal after the quote discount. There is no per-line tax. Cost if wrong: per-line tax rates need a schema version 2.
- **Formulas:** a small recursive-descent evaluator over `+ - * / ( )`, numbers and lowercase column ids. No `eval`, no functions. Cost if wrong: users needing `min`/`max`/`round` wait for a later version.
- **Variables:** templates and documents keep `[Group.Name]` tokens in their content. Values come from automatic sources (contact, sender, organization, document) plus custom values stored in `documents.variables`. Plan 3 resolves them into the frozen revision at send. Cost if wrong: none for Plan 2; the editor shows tokens rather than values.
- **Fields:** signature, date, text and checkbox fields are inline nodes in the content with an id, kind, role, required flag and label. The `fields` table from the spec is created in Plan 3, when send copies fields out of the revision. Cost if wrong: Plan 3 adds the table as planned.
- **Images:** the image block needs S3-compatible storage, which Plan 3 adds for signature images and PDFs. The image block moves to Plan 3. Cost if wrong: templates in 0.2.0 cannot contain images.
- **Settings table** (signature modes, expiry, consent text) moves to Plan 3, where signing uses it.
- **Editing after send:** Plan 2 allows edits only in `draft`. Plan 3 adds "editing a sent document returns it to draft and invalidates tokens".
- **TipTap version:** `3.31.3` (4 September 2026). Newer releases are under two weeks old on the day this plan was written.

---

## File Structure

```
src/lib/money.ts                         Currency codes, exponents, parse/format minor units (Task 1)
src/lib/quote/formula.ts                 Safe formula parser and evaluator (Task 1)
src/lib/quote/schema.ts                  Quote Zod schema, semantic checks, emptyQuote (Task 2)
src/lib/quote/totals.ts                  computeQuote: line, section and quote totals (Task 2)
src/lib/editor/extensions.ts             TipTap node set: StarterKit, tables, pageBreak, quoteBlock, field (Task 3)
src/lib/editor/content.ts                Content validation, fields, variables helpers (Task 3)
src/lib/editor/variables.ts              Automatic variable names and values (Task 3)
src/lib/documents.ts                     Document types, statuses, labels (Task 4)
src/server/documents/lifecycle.ts        Status state machine (Task 4)
src/db/schema/content.ts                 contacts, products, templates, documents, recipients, numbering_sequences (Task 5)
drizzle/0002_content.sql                 Generated migration (Task 5)
src/server/errors.ts                     + NotFoundError (Task 5)
src/server/db-errors.ts                  isUniqueViolation (Task 5)
src/server/contacts/contacts.ts          Contact service (Task 6)
src/server/catalog/products.ts           Product service (Task 7)
src/server/templates/templates.ts        Template service (Task 8)
src/server/documents/numbering.ts        allocateDocumentNumber (Task 11)
src/server/documents/documents.ts        Document service (Task 11)
src/server/documents/recipients.ts       Recipient service (Task 12)
src/server/documents/readiness.ts        checkSendReadiness (Task 12)
src/app/app/action-state.ts              ActionState type and error mapping for actions (Task 6)
src/app/app/ui.tsx                       Shared class names and FormStatus (Task 6)
src/app/app/layout.tsx                   Nav links (Tasks 6, 7, 9, 13)
src/app/app/contacts/...                 Contact pages and actions (Task 6)
src/app/app/catalog/...                  Catalog pages and actions (Task 7)
src/components/editor/rich-editor.tsx    TipTap editor with toolbar (Task 9)
src/components/editor/quote-editor.tsx   Pricing table editor with live totals (Task 10)
src/app/app/templates/...                Template pages and actions (Tasks 9, 10)
src/app/app/documents/...                Document pages and actions (Task 13)
src/app/globals.css                      Editor styles (Task 9)
CHANGELOG.md, package.json, README.md    Release 0.2.0 (Task 14)
```

Tests live under `tests/lib/`, `tests/db/` and `tests/server/`, mirroring the source paths.

---

### Task 1: Money helpers and formula evaluator

**Files:**
- Create: `src/lib/money.ts`
- Create: `src/lib/quote/formula.ts`
- Test: `tests/lib/money.test.ts`
- Test: `tests/lib/formula.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_MINOR_AMOUNT: number` (999_999_999_999)
  - `isCurrencyCode(value: string): boolean`
  - `currencyExponent(currency: string): number`
  - `formatMoney(minor: number, currency: string, locale?: string): string`
  - `parseMoney(input: string, currency: string): number | null`
  - `minorToDecimalString(minor: number, currency: string): string`
  - `type FormulaAst`, `class FormulaError extends Error`
  - `parseFormula(source: string): FormulaAst`
  - `formulaRefs(ast: FormulaAst): string[]`
  - `evaluateFormula(ast: FormulaAst, values: Record<string, number>): number`

- [ ] **Step 1: Write the failing money tests**

Create `tests/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  formatMoney,
  isCurrencyCode,
  MAX_MINOR_AMOUNT,
  minorToDecimalString,
  parseMoney,
} from "@/lib/money";

describe("money", () => {
  it("knows how many minor digits a currency has", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("BHD")).toBe(3);
  });

  it("accepts only known uppercase ISO 4217 codes", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("US")).toBe(false);
    expect(isCurrencyCode("ABC")).toBe(false);
  });

  it("parses decimal input into minor units", () => {
    expect(parseMoney("1,250.5", "USD")).toBe(125050);
    expect(parseMoney(" 12 ", "USD")).toBe(1200);
    expect(parseMoney("0.07", "USD")).toBe(7);
    expect(parseMoney("1250", "JPY")).toBe(1250);
    expect(parseMoney("1.234", "BHD")).toBe(1234);
  });

  it("rejects malformed, negative, over-precise and oversized input", () => {
    expect(parseMoney("", "USD")).toBeNull();
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(parseMoney("-1", "USD")).toBeNull();
    expect(parseMoney("1.234", "USD")).toBeNull();
    expect(parseMoney("12.5", "JPY")).toBeNull();
    expect(parseMoney("1e5", "USD")).toBeNull();
    expect(parseMoney(String(MAX_MINOR_AMOUNT), "USD")).toBeNull();
  });

  it("formats minor units for display", () => {
    expect(formatMoney(125050, "USD")).toBe("$1,250.50");
    expect(formatMoney(1250, "JPY")).toBe("¥1,250");
  });

  it("converts minor units back to an input string", () => {
    expect(minorToDecimalString(125050, "USD")).toBe("1250.50");
    expect(minorToDecimalString(1250, "JPY")).toBe("1250");
  });
});
```

- [ ] **Step 2: Run the money tests to verify they fail**

Run: `npx vitest run tests/lib/money.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/money"".

- [ ] **Step 3: Implement `src/lib/money.ts`**

```ts
// Money is stored as integer minor units (cents for USD, yen for JPY) plus an ISO 4217 code.

export const MAX_MINOR_AMOUNT = 999_999_999_999;

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value) && SUPPORTED_CURRENCIES.has(value);
}

export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(minor: number, currency: string, locale = "en-US"): string {
  const exponent = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** exponent);
}

/**
 * Parses a non-negative decimal string such as "1,250.50" into minor units.
 * Returns null for malformed input, more decimals than the currency allows,
 * or amounts above MAX_MINOR_AMOUNT.
 */
export function parseMoney(input: string, currency: string): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input.trim().replace(/,/g, ""));
  if (!match) return null;
  const exponent = currencyExponent(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return null;
  const minor = Number(match[1]) * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR_AMOUNT ? minor : null;
}

/** Minor units to the plain decimal string an input field shows: 125050 USD -> "1250.50". */
export function minorToDecimalString(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  return (minor / 10 ** exponent).toFixed(exponent);
}
```

- [ ] **Step 4: Run the money tests to verify they pass**

Run: `npx vitest run tests/lib/money.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing formula tests**

Create `tests/lib/formula.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateFormula, FormulaError, formulaRefs, parseFormula } from "@/lib/quote/formula";

const run = (source: string, values: Record<string, number> = {}) => evaluateFormula(parseFormula(source), values);

describe("formula evaluator", () => {
  it("follows arithmetic precedence and parentheses", () => {
    expect(run("2 + 3 * 4")).toBe(14);
    expect(run("(2 + 3) * 4")).toBe(20);
    expect(run("10 - 4 - 3")).toBe(3);
    expect(run("12 / 4 / 3")).toBe(1);
    expect(run("-2 * -3")).toBe(6);
    expect(run("price * 1.5", { price: 1000 })).toBe(1500);
  });

  it("evaluates column references", () => {
    expect(run("price * qty", { price: 1999, qty: 3 })).toBe(5997);
    expect(run("rate * hours + fee", { rate: 15000, hours: 2.5, fee: 500 })).toBe(38000);
  });

  it("lists the columns a formula references", () => {
    expect(formulaRefs(parseFormula("rate * hours + rate"))).toEqual(["rate", "hours"]);
  });

  it.each([
    ["", "Formula is empty."],
    ["price *", "Formula ends unexpectedly."],
    ["price + * qty", 'Unexpected "*" in formula.'],
    ["(price", "Missing closing parenthesis."],
    ["price)", 'Unexpected ")" in formula.'],
    ["process.exit()", 'Unexpected character "." in formula.'],
    ["Price", 'Unexpected character "P" in formula.'],
    ["a".repeat(201), "Formula is longer than 200 characters."],
    ["(".repeat(40) + "1" + ")".repeat(40), "Formula is nested too deeply."],
  ])("rejects %j with a readable message", (source, message) => {
    expect(() => parseFormula(source)).toThrow(new FormulaError(message));
  });

  it("rejects unknown columns, including inherited object properties", () => {
    expect(() => run("constructor")).toThrow(new FormulaError('Unknown column "constructor".'));
    expect(() => run("__proto__ * 2")).toThrow(new FormulaError('Unknown column "__proto__".'));
    expect(() => run("missing + 1", { price: 1 })).toThrow(new FormulaError('Unknown column "missing".'));
  });

  it("rejects division by zero", () => {
    expect(() => run("price / qty", { price: 100, qty: 0 })).toThrow(new FormulaError("Division by zero in formula."));
  });
});
```

- [ ] **Step 6: Run the formula tests to verify they fail**

Run: `npx vitest run tests/lib/formula.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/quote/formula"".

- [ ] **Step 7: Implement `src/lib/quote/formula.ts`**

```ts
// A small arithmetic language for pricing-table columns: numbers, lowercase
// column ids, + - * / and parentheses. It never calls eval or Function.

export type FormulaAst =
  | { kind: "num"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "neg"; arg: FormulaAst }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaAst; right: FormulaAst };

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

const MAX_LENGTH = 200;
const MAX_DEPTH = 32;

type Token = { type: "num"; value: number } | { type: "ident"; value: string } | { type: "op"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    const rest = source.slice(i);
    const num = /^\d+(?:\.\d+)?/.exec(rest);
    if (num) {
      tokens.push({ type: "num", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const ident = /^[a-z_][a-z0-9_]*/.exec(rest);
    if (ident) {
      tokens.push({ type: "ident", value: ident[0] });
      i += ident[0].length;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}" in formula.`);
  }
  return tokens;
}

export function parseFormula(source: string): FormulaAst {
  if (source.trim() === "") throw new FormulaError("Formula is empty.");
  if (source.length > MAX_LENGTH) throw new FormulaError(`Formula is longer than ${MAX_LENGTH} characters.`);
  const tokens = tokenize(source);
  let pos = 0;

  const isOp = (value: string) => {
    const token = tokens[pos];
    return token?.type === "op" && token.value === value;
  };

  function expression(depth: number): FormulaAst {
    let left = term(depth);
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value as "+" | "-";
      left = { kind: "bin", op, left, right: term(depth) };
    }
    return left;
  }

  function term(depth: number): FormulaAst {
    let left = unary(depth);
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].value as "*" | "/";
      left = { kind: "bin", op, left, right: unary(depth) };
    }
    return left;
  }

  function unary(depth: number): FormulaAst {
    if (depth > MAX_DEPTH) throw new FormulaError("Formula is nested too deeply.");
    if (isOp("-")) {
      pos++;
      return { kind: "neg", arg: unary(depth + 1) };
    }
    return primary(depth);
  }

  function primary(depth: number): FormulaAst {
    const token = tokens[pos++];
    if (!token) throw new FormulaError("Formula ends unexpectedly.");
    if (token.type === "num") return { kind: "num", value: token.value };
    if (token.type === "ident") return { kind: "ref", name: token.value };
    if (token.value === "(") {
      const inner = expression(depth + 1);
      if (!isOp(")")) throw new FormulaError("Missing closing parenthesis.");
      pos++;
      return inner;
    }
    throw new FormulaError(`Unexpected "${token.value}" in formula.`);
  }

  const ast = expression(0);
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${String(tokens[pos].value)}" in formula.`);
  return ast;
}

export function formulaRefs(ast: FormulaAst): string[] {
  const names = new Set<string>();
  const visit = (node: FormulaAst) => {
    if (node.kind === "ref") names.add(node.name);
    else if (node.kind === "neg") visit(node.arg);
    else if (node.kind === "bin") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(ast);
  return [...names];
}

export function evaluateFormula(ast: FormulaAst, values: Record<string, number>): number {
  const result = evaluate(ast, values);
  if (!Number.isFinite(result)) throw new FormulaError("Formula result is not a finite number.");
  return result;
}

function evaluate(node: FormulaAst, values: Record<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "ref":
      // Object.hasOwn keeps inherited names such as "constructor" out.
      if (!Object.hasOwn(values, node.name)) throw new FormulaError(`Unknown column "${node.name}".`);
      return values[node.name];
    case "neg":
      return -evaluate(node.arg, values);
    case "bin": {
      const left = evaluate(node.left, values);
      const right = evaluate(node.right, values);
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      if (node.op === "*") return left * right;
      if (right === 0) throw new FormulaError("Division by zero in formula.");
      return left / right;
    }
  }
}
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `npx vitest run tests/lib/money.test.ts tests/lib/formula.test.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/money.ts src/lib/quote/formula.ts tests/lib/money.test.ts tests/lib/formula.test.ts
git commit -m "feat: add money helpers and a safe pricing formula evaluator"
```

---

### Task 2: Quote schema and totals

**Files:**
- Create: `src/lib/quote/schema.ts`
- Create: `src/lib/quote/totals.ts`
- Create: `src/lib/ids.ts`
- Test: `tests/lib/quote-schema.test.ts`
- Test: `tests/lib/quote-totals.test.ts`
- Test: `tests/lib/ids.test.ts`

**Interfaces:**
- Consumes (Task 1): `isCurrencyCode`, `MAX_MINOR_AMOUNT`, `parseFormula`, `formulaRefs`, `evaluateFormula`, `FormulaError`.
- Produces:
  - `type Quote`, `type QuoteSection`, `type QuoteItem`, `type QuoteColumn`, `type Adjustment`
  - `QuoteSchema` (Zod), `DEFAULT_AMOUNT_FORMULA = "price * qty"`, `RESERVED_FIELDS = ["price", "qty"]`
  - `safeParseQuote(input: unknown): { ok: true; quote: Quote } | { ok: false; error: string }`
  - `emptyQuote(currency: string): Quote`
  - `newQuoteItem(input?: Partial<QuoteItem>): QuoteItem`
  - `newQuoteSection(): QuoteSection`
  - `newId(): string` (random id that also works on plain-HTTP pages, where `crypto.randomUUID` is unavailable)
  - `class QuoteError extends Error`
  - `type LineTotal = { sectionId: string; itemId: string; included: boolean; base: number; discount: number; net: number }`
  - `type QuoteTotals = { currency: string; lines: LineTotal[]; sections: { sectionId: string; net: number }[]; subtotal: number; discount: number; tax: number; total: number }`
  - `isItemIncluded(section: QuoteSection, item: QuoteItem): boolean`
  - `computeQuote(quote: Quote): QuoteTotals` (throws `QuoteError`)

Calculation rules (the tests pin them):
- A line's **base** is `amountFormula` evaluated with `price` (minor units), `qty` and every numeric column, rounded half up to whole minor units. Columns are evaluated in order; a formula column may use `price`, `qty` and columns defined before it. A missing numeric value counts as 0. Text columns are never numeric.
- Line **discount**: percent of base (rounded) or an absolute amount, capped at the base. **net** = base − discount.
- A line is **included** when its section is `standard` and the line is not optional or is selected, or when its section is `multichoice` and the line is selected.
- **subtotal** = sum of included nets. Quote **discount**: percent of subtotal (rounded) or absolute, capped at the subtotal. **tax**: percent of (subtotal − discount), rounded, or an absolute amount. **total** = subtotal − discount + tax.
- A negative base, or a total above `MAX_MINOR_AMOUNT`, is a `QuoteError`. Formula errors in a line become `QuoteError` messages naming the line.

- [ ] **Step 1: Add the id helper with its test**

Browsers expose `crypto.randomUUID` only on HTTPS or localhost, and self-hosted installs may run on plain HTTP inside a network. Ids created in the browser use this helper.

Create `tests/lib/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";

describe("newId", () => {
  it("returns distinct non-empty ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    // Shadow the method with an own property, then delete it to restore the original.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      delete (crypto as unknown as Record<string, unknown>).randomUUID;
    }
    expect(typeof crypto.randomUUID).toBe("function");
  });
});
```

Create `src/lib/ids.ts`:

```ts
/** A random id. crypto.randomUUID only exists in secure contexts, so plain-HTTP pages fall back to getRandomValues. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

Run: `npx vitest run tests/lib/ids.test.ts`
Expected: PASS.

- [ ] **Step 1b: Write the failing schema tests**

Create `tests/lib/quote-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyQuote, safeParseQuote } from "@/lib/quote/schema";

const item = (overrides: Record<string, unknown> = {}) => ({ id: "i1", name: "Design", price: 1000, qty: 1, ...overrides });
const quote = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  currency: "USD",
  sections: [{ id: "s1", items: [item()] }],
  ...overrides,
});
const errorOf = (input: unknown) => {
  const result = safeParseQuote(input);
  if (result.ok) throw new Error("expected a validation error");
  return result.error;
};

describe("quote schema", () => {
  it("fills defaults for a minimal quote", () => {
    const result = safeParseQuote({ version: 1, currency: "EUR" });
    expect(result).toEqual({
      ok: true,
      quote: { version: 1, currency: "EUR", amountFormula: "price * qty", columns: [], sections: [], discount: null, tax: null },
    });
  });

  it("builds an empty quote with one section", () => {
    const q = emptyQuote("JPY");
    expect(q.currency).toBe("JPY");
    expect(q.sections).toHaveLength(1);
    expect(q.sections[0].items).toEqual([]);
    expect(safeParseQuote(q).ok).toBe(true);
  });

  it("rejects an unknown currency", () => {
    expect(errorOf(quote({ currency: "ABC" }))).toBe("Unknown currency code.");
  });

  it("requires a name on every line item", () => {
    expect(errorOf(quote({ sections: [{ id: "s1", items: [item({ name: " " })] }] }))).toBe("Every line item needs a name.");
  });

  it("rejects fractional or negative prices", () => {
    expect(safeParseQuote(quote({ sections: [{ id: "s1", items: [item({ price: 10.5 })] }] })).ok).toBe(false);
    expect(safeParseQuote(quote({ sections: [{ id: "s1", items: [item({ price: -1 })] }] })).ok).toBe(false);
  });

  it("rejects a percent above 100", () => {
    expect(safeParseQuote(quote({ tax: { type: "percent", value: 101 } })).ok).toBe(false);
  });

  it("rejects reserved and duplicate column ids", () => {
    expect(errorOf(quote({ columns: [{ id: "price", label: "Price", type: "money" }] }))).toBe(
      'Column id "price" is reserved.',
    );
    expect(
      errorOf(quote({ columns: [{ id: "hours", label: "Hours", type: "number" }, { id: "hours", label: "H", type: "number" }] })),
    ).toBe('Column id "hours" is used twice.');
  });

  it("rejects formulas on text columns and references to later or text columns", () => {
    expect(errorOf(quote({ columns: [{ id: "note", label: "Note", type: "text", formula: "price" }] }))).toBe(
      'Text column "Note" cannot have a formula.',
    );
    expect(
      errorOf(
        quote({
          columns: [
            { id: "total_hours", label: "Total", type: "number", formula: "hours * 2" },
            { id: "hours", label: "Hours", type: "number" },
          ],
        }),
      ),
    ).toBe('Column "Total" uses "hours", which is not a number column defined before it.');
    expect(
      errorOf(quote({ columns: [{ id: "note", label: "Note", type: "text" }], amountFormula: "price * note" })),
    ).toBe('The amount formula uses "note", which is not a number column.');
  });

  it("reports formula syntax errors", () => {
    expect(errorOf(quote({ amountFormula: "price *" }))).toBe("Amount formula: Formula ends unexpectedly.");
  });

  it("allows at most one selected item in a multichoice section", () => {
    const section = { id: "s1", kind: "multichoice", items: [item({ id: "a" }), item({ id: "b" })] };
    expect(errorOf(quote({ sections: [section] }))).toBe("A multichoice section can have only one selected item.");
  });

  it("rejects duplicate item ids", () => {
    expect(errorOf(quote({ sections: [{ id: "s1", items: [item(), item()] }] }))).toBe('Line item id "i1" is used twice.');
  });
});
```

- [ ] **Step 2: Run the schema tests to verify they fail**

Run: `npx vitest run tests/lib/quote-schema.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/quote/schema"".

- [ ] **Step 3: Implement `src/lib/quote/schema.ts`**

```ts
import { z } from "zod";
import { newId } from "@/lib/ids";
import { isCurrencyCode, MAX_MINOR_AMOUNT } from "@/lib/money";
import { FormulaError, formulaRefs, parseFormula } from "./formula";

export const DEFAULT_AMOUNT_FORMULA = "price * qty";
export const RESERVED_FIELDS = ["price", "qty"] as const;
export const QUOTE_LIMITS = { sections: 50, items: 500, columns: 10 } as const;

const minorAmount = z.number().int().min(0).max(MAX_MINOR_AMOUNT);

export const AdjustmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("percent"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("absolute"), amount: minorAmount }),
]);

export const ColumnSchema = z.object({
  id: z.string().regex(/^[a-z_][a-z0-9_]{0,31}$/, "Column ids use lowercase letters, digits and underscores."),
  label: z.string().trim().min(1, "Every column needs a label.").max(60),
  type: z.enum(["text", "number", "money", "percent"]),
  formula: z.string().max(200).nullable().default(null),
});

export const ItemSchema = z.object({
  id: z.string().min(1).max(64),
  productId: z.string().max(64).nullable().default(null),
  name: z.string().trim().min(1, "Every line item needs a name.").max(200),
  description: z.string().max(2000).default(""),
  price: minorAmount,
  qty: z.number().min(0).max(1_000_000),
  optional: z.boolean().default(false),
  selected: z.boolean().default(true),
  discount: AdjustmentSchema.nullable().default(null),
  values: z.record(z.string(), z.union([z.string().max(500), z.number()])).default({}),
});

export const SectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(200).default(""),
  kind: z.enum(["standard", "multichoice"]).default("standard"),
  items: z.array(ItemSchema).default([]),
});

export const QuoteSchema = z
  .object({
    version: z.literal(1),
    currency: z.string().refine(isCurrencyCode, "Unknown currency code."),
    amountFormula: z.string().max(200).default(DEFAULT_AMOUNT_FORMULA),
    columns: z.array(ColumnSchema).max(QUOTE_LIMITS.columns).default([]),
    sections: z.array(SectionSchema).max(QUOTE_LIMITS.sections).default([]),
    discount: AdjustmentSchema.nullable().default(null),
    tax: AdjustmentSchema.nullable().default(null),
  })
  .superRefine((quote, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    // Columns: unique, not reserved, formulas only over numeric columns defined earlier.
    const numeric = new Set<string>(RESERVED_FIELDS);
    const seenColumns = new Set<string>();
    for (const column of quote.columns) {
      if ((RESERVED_FIELDS as readonly string[]).includes(column.id)) return fail(`Column id "${column.id}" is reserved.`);
      if (seenColumns.has(column.id)) return fail(`Column id "${column.id}" is used twice.`);
      seenColumns.add(column.id);
      if (column.formula !== null) {
        if (column.type === "text") return fail(`Text column "${column.label}" cannot have a formula.`);
        let refs: string[];
        try {
          refs = formulaRefs(parseFormula(column.formula));
        } catch (error) {
          if (error instanceof FormulaError) return fail(`Column "${column.label}": ${error.message}`);
          throw error;
        }
        const bad = refs.find((ref) => !numeric.has(ref));
        if (bad) return fail(`Column "${column.label}" uses "${bad}", which is not a number column defined before it.`);
      }
      if (column.type !== "text") numeric.add(column.id);
    }

    try {
      const bad = formulaRefs(parseFormula(quote.amountFormula)).find((ref) => !numeric.has(ref));
      if (bad) return fail(`The amount formula uses "${bad}", which is not a number column.`);
    } catch (error) {
      if (error instanceof FormulaError) return fail(`Amount formula: ${error.message}`);
      throw error;
    }

    // Sections and items: unique ids, item limit, one selection per multichoice section.
    const sectionIds = new Set<string>();
    const itemIds = new Set<string>();
    let itemCount = 0;
    for (const section of quote.sections) {
      if (sectionIds.has(section.id)) return fail(`Section id "${section.id}" is used twice.`);
      sectionIds.add(section.id);
      if (section.kind === "multichoice" && section.items.filter((item) => item.selected).length > 1) {
        return fail("A multichoice section can have only one selected item.");
      }
      for (const item of section.items) {
        if (itemIds.has(item.id)) return fail(`Line item id "${item.id}" is used twice.`);
        itemIds.add(item.id);
        itemCount++;
      }
    }
    if (itemCount > QUOTE_LIMITS.items) fail(`A quote can have at most ${QUOTE_LIMITS.items} line items.`);
  });

export type Adjustment = z.output<typeof AdjustmentSchema>;
export type QuoteColumn = z.output<typeof ColumnSchema>;
export type QuoteItem = z.output<typeof ItemSchema>;
export type QuoteSection = z.output<typeof SectionSchema>;
export type Quote = z.output<typeof QuoteSchema>;

export function safeParseQuote(input: unknown): { ok: true; quote: Quote } | { ok: false; error: string } {
  const result = QuoteSchema.safeParse(input);
  if (result.success) return { ok: true, quote: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "The pricing table is not valid." };
}

export function newQuoteItem(input: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: newId(),
    productId: null,
    name: "New item",
    description: "",
    price: 0,
    qty: 1,
    optional: false,
    selected: true,
    discount: null,
    values: {},
    ...input,
  };
}

export function newQuoteSection(): QuoteSection {
  return { id: newId(), title: "", kind: "standard", items: [] };
}

export function emptyQuote(currency: string): Quote {
  return {
    version: 1,
    currency,
    amountFormula: DEFAULT_AMOUNT_FORMULA,
    columns: [],
    sections: [newQuoteSection()],
    discount: null,
    tax: null,
  };
}
```

- [ ] **Step 4: Run the schema tests to verify they pass**

Run: `npx vitest run tests/lib/quote-schema.test.ts`
Expected: PASS. If the Zod default-filling test fails because Zod 4 reports defaults differently, fix the schema, not the test.

- [ ] **Step 5: Write the failing totals tests**

Create `tests/lib/quote-totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type Quote, safeParseQuote } from "@/lib/quote/schema";
import { computeQuote, QuoteError } from "@/lib/quote/totals";

function q(input: Record<string, unknown>): Quote {
  const result = safeParseQuote({ version: 1, currency: "USD", ...input });
  if (!result.ok) throw new Error(result.error);
  return result.quote;
}
const line = (id: string, price: number, qty: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Item ${id}`,
  price,
  qty,
  ...extra,
});

describe("computeQuote", () => {
  it("sums price times quantity", () => {
    const totals = computeQuote(q({ sections: [{ id: "s", items: [line("a", 1000, 2), line("b", 500, 1)] }] }));
    expect(totals.subtotal).toBe(2500);
    expect(totals.total).toBe(2500);
    expect(totals.sections).toEqual([{ sectionId: "s", net: 2500 }]);
    expect(totals.lines.map((l) => l.net)).toEqual([2000, 500]);
  });

  it("applies a rounded percent line discount", () => {
    const totals = computeQuote(
      q({ sections: [{ id: "s", items: [line("a", 1999, 3, { discount: { type: "percent", value: 10 } })] }] }),
    );
    expect(totals.lines[0]).toMatchObject({ base: 5997, discount: 600, net: 5397 });
  });

  it("caps an absolute line discount at the line amount", () => {
    const totals = computeQuote(
      q({ sections: [{ id: "s", items: [line("a", 1000, 1, { discount: { type: "absolute", amount: 5000 } })] }] }),
    );
    expect(totals.lines[0]).toMatchObject({ base: 1000, discount: 1000, net: 0 });
  });

  it("applies the quote discount before tax", () => {
    const totals = computeQuote(
      q({
        sections: [{ id: "s", items: [line("a", 10000, 1)] }],
        discount: { type: "percent", value: 10 },
        tax: { type: "percent", value: 7.25 },
      }),
    );
    expect(totals).toMatchObject({ subtotal: 10000, discount: 1000, tax: 653, total: 9653 });
  });

  it("supports absolute quote discount and tax, capping the discount", () => {
    const totals = computeQuote(
      q({
        sections: [{ id: "s", items: [line("a", 1000, 1)] }],
        discount: { type: "absolute", amount: 9999 },
        tax: { type: "absolute", amount: 250 },
      }),
    );
    expect(totals).toMatchObject({ subtotal: 1000, discount: 1000, tax: 250, total: 250 });
  });

  it("excludes optional lines that are not selected but still prices them", () => {
    const totals = computeQuote(
      q({
        sections: [
          {
            id: "s",
            items: [line("a", 1000, 1), line("b", 400, 1, { optional: true, selected: false }), line("c", 300, 1, { optional: true })],
          },
        ],
      }),
    );
    expect(totals.subtotal).toBe(1300);
    expect(totals.lines[1]).toMatchObject({ included: false, net: 400 });
  });

  it("counts only the selected line of a multichoice section", () => {
    const section = (selected: string | null) => ({
      id: "m",
      kind: "multichoice",
      items: [line("a", 1000, 1, { selected: selected === "a" }), line("b", 2000, 1, { selected: selected === "b" })],
    });
    expect(computeQuote(q({ sections: [section("b")] })).subtotal).toBe(2000);
    expect(computeQuote(q({ sections: [section(null)] })).subtotal).toBe(0);
  });

  it("evaluates custom number, money and formula columns", () => {
    const totals = computeQuote(
      q({
        columns: [
          { id: "hours", label: "Hours", type: "number" },
          { id: "fee", label: "Setup fee", type: "money" },
          { id: "labor", label: "Labor", type: "money", formula: "price * hours" },
        ],
        amountFormula: "labor + fee",
        sections: [{ id: "s", items: [line("a", 15000, 1, { values: { hours: 2.5, fee: 500 } }), line("b", 100, 1)] }],
      }),
    );
    expect(totals.lines.map((l) => l.base)).toEqual([38000, 0]);
  });

  it("keeps zero-decimal currencies in whole units", () => {
    const totals = computeQuote(
      q({ currency: "JPY", sections: [{ id: "s", items: [line("a", 1250, 3)] }], tax: { type: "percent", value: 10 } }),
    );
    expect(totals).toMatchObject({ currency: "JPY", subtotal: 3750, tax: 375, total: 4125 });
  });

  it("rejects a negative line amount, naming the line", () => {
    const quote = q({ amountFormula: "price - 5000", sections: [{ id: "s", items: [line("a", 1000, 1)] }] });
    expect(() => computeQuote(quote)).toThrow(new QuoteError('"Item a" has a negative amount.'));
  });

  it("reports division by zero in a line, naming the line", () => {
    const quote = q({ amountFormula: "price / qty", sections: [{ id: "s", items: [line("a", 1000, 0)] }] });
    expect(() => computeQuote(quote)).toThrow(new QuoteError('"Item a": Division by zero in formula.'));
  });

  it("rejects a total above the maximum amount", () => {
    const quote = q({ sections: [{ id: "s", items: [line("a", 999_999_999_998, 2)] }] });
    expect(() => computeQuote(quote)).toThrow(QuoteError);
  });
});
```

- [ ] **Step 6: Run the totals tests to verify they fail**

Run: `npx vitest run tests/lib/quote-totals.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/quote/totals"".

- [ ] **Step 7: Implement `src/lib/quote/totals.ts`**

```ts
import { MAX_MINOR_AMOUNT } from "@/lib/money";
import { evaluateFormula, type FormulaAst, FormulaError, parseFormula } from "./formula";
import type { Adjustment, Quote, QuoteItem, QuoteSection } from "./schema";

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

export type LineTotal = {
  sectionId: string;
  itemId: string;
  included: boolean;
  base: number;
  discount: number;
  net: number;
};

export type QuoteTotals = {
  currency: string;
  lines: LineTotal[];
  sections: { sectionId: string; net: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

export function isItemIncluded(section: QuoteSection, item: QuoteItem): boolean {
  return section.kind === "multichoice" ? item.selected : !item.optional || item.selected;
}

// Rounds half up to whole minor units, after trimming binary floating-point noise.
function roundMinor(value: number): number {
  return Math.round(Number(value.toFixed(6)));
}

function adjustmentAmount(adjustment: Adjustment | null, of: number): number {
  if (!adjustment) return 0;
  return adjustment.type === "percent" ? roundMinor((of * adjustment.value) / 100) : adjustment.amount;
}

export function computeQuote(quote: Quote): QuoteTotals {
  const amount = parseFormula(quote.amountFormula);
  const columnFormulas = new Map<string, FormulaAst>();
  for (const column of quote.columns) {
    if (column.formula !== null) columnFormulas.set(column.id, parseFormula(column.formula));
  }

  const lines: LineTotal[] = [];
  const sections: QuoteTotals["sections"] = [];
  let subtotal = 0;

  for (const section of quote.sections) {
    let sectionNet = 0;
    for (const item of section.items) {
      const base = lineBase(quote, item, amount, columnFormulas);
      const discount = Math.min(adjustmentAmount(item.discount, base), base);
      const net = base - discount;
      const included = isItemIncluded(section, item);
      if (included) sectionNet += net;
      lines.push({ sectionId: section.id, itemId: item.id, included, base, discount, net });
    }
    sections.push({ sectionId: section.id, net: sectionNet });
    subtotal += sectionNet;
  }

  const discount = Math.min(adjustmentAmount(quote.discount, subtotal), subtotal);
  const tax = adjustmentAmount(quote.tax, subtotal - discount);
  const total = subtotal - discount + tax;
  if (total > MAX_MINOR_AMOUNT) throw new QuoteError("The quote total is too large.");
  return { currency: quote.currency, lines, sections, subtotal, discount, tax, total };
}

function lineBase(quote: Quote, item: QuoteItem, amount: FormulaAst, columnFormulas: Map<string, FormulaAst>): number {
  const values: Record<string, number> = { price: item.price, qty: item.qty };
  try {
    for (const column of quote.columns) {
      if (column.type === "text") continue;
      const formula = columnFormulas.get(column.id);
      if (formula) {
        values[column.id] = evaluateFormula(formula, values);
      } else {
        const raw = item.values[column.id];
        values[column.id] = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      }
    }
    const base = roundMinor(evaluateFormula(amount, values));
    if (base < 0) throw new QuoteError(`"${item.name}" has a negative amount.`);
    if (base > MAX_MINOR_AMOUNT) throw new QuoteError(`"${item.name}" is too large.`);
    return base;
  } catch (error) {
    if (error instanceof FormulaError) throw new QuoteError(`"${item.name}": ${error.message}`);
    throw error;
  }
}
```

- [ ] **Step 8: Run the quote tests to verify they pass**

Run: `npx vitest run tests/lib/quote-schema.test.ts tests/lib/quote-totals.test.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/ids.ts src/lib/quote/schema.ts src/lib/quote/totals.ts tests/lib/ids.test.ts tests/lib/quote-schema.test.ts tests/lib/quote-totals.test.ts
git commit -m "feat: add the quote schema and totals engine"
```

---
### Task 3: Editor node set, content validation and variables

**Files:**
- Modify: `package.json`, `package-lock.json` (TipTap dependencies)
- Create: `src/lib/editor/extensions.ts`
- Create: `src/lib/editor/content.ts`
- Create: `src/lib/editor/variables.ts`
- Test: `tests/lib/editor-content.test.ts`
- Test: `tests/lib/variables.test.ts`

**Interfaces:**
- Consumes (Task 1): `formatMoney`.
- Produces:
  - `editorExtensions: Extensions` (StarterKit, TableKit, `pageBreak`, `quoteBlock`, `field`)
  - `FIELD_KINDS = ["signature", "date", "text", "checkbox"] as const`, `type FieldKind`, `FIELD_LABELS: Record<FieldKind, string>`
  - `type DocContent = JSONContent`
  - `emptyContent(title?: string): DocContent`
  - `type ContentField = { id: string; kind: FieldKind; role: string; required: boolean; label: string }`
  - `extractFields(content: DocContent): ContentField[]`
  - `fieldLabel(field: { kind: FieldKind; label: string }): string`
  - `countQuoteBlocks(content: DocContent): number`
  - `VARIABLE_PATTERN: RegExp`, `VARIABLE_NAME_PATTERN: RegExp`
  - `extractVariables(content: DocContent): string[]` (names such as `"Client.Name"`, unique, in order)
  - `resolveVariables(content: DocContent, values: Record<string, string>): DocContent` (returns a copy)
  - `validateContent(input: unknown, roles: string[]): { ok: true; content: DocContent } | { ok: false; error: string }`
  - `AUTOMATIC_VARIABLES: readonly string[]`
  - `type VariableSources`
  - `automaticVariableValues(sources: VariableSources): Record<string, string>`
  - `variableValues(sources: VariableSources, custom: Record<string, string>): Record<string, string>`

Node rules: `pageBreak` and `quoteBlock` are block atoms. `field` is an inline atom with attributes `id`, `kind`, `role`, `required` and `label`. A document has at most one `quoteBlock`; it marks where the document's single pricing table appears.

- [ ] **Step 1: Install TipTap at the pinned version**

Run:

```bash
npm install --save-exact @tiptap/core@3.31.3 @tiptap/pm@3.31.3 @tiptap/react@3.31.3 @tiptap/starter-kit@3.31.3 @tiptap/extension-table@3.31.3
```

Expected: `package.json` lists the five packages at exactly `3.31.3`. If npm reports a peer conflict with React 19.3, stop and report it; do not use `--force` or `--legacy-peer-deps`.

- [ ] **Step 2: Write the failing content tests**

Create `tests/lib/editor-content.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the content tests to verify they fail**

Run: `npx vitest run tests/lib/editor-content.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/editor/content"".

- [ ] **Step 4: Implement `src/lib/editor/extensions.ts`**

```ts
import { type Extensions, mergeAttributes, Node } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

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
      id: dataAttribute("id", null),
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
```

If `StarterKit.configure` in 3.31.3 does not accept a `link` key (check `node_modules/@tiptap/starter-kit/dist/index.d.ts`), drop that option and leave a one-line comment saying links open on click; do not add a separate Link package.

- [ ] **Step 5: Implement `src/lib/editor/content.ts`**

```ts
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
    if (!field.id || ids.has(field.id)) return { ok: false, error: "Every field needs a unique id." };
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
```

- [ ] **Step 6: Run the content tests to verify they pass**

Run: `npx vitest run tests/lib/editor-content.test.ts`
Expected: PASS. If importing the extensions fails under Node because a TipTap module touches `window` or `document` at import time, report it as BLOCKED with the error; do not switch the test environment to a browser emulator.

- [ ] **Step 7: Write the failing variables tests**

Create `tests/lib/variables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AUTOMATIC_VARIABLES, automaticVariableValues, variableValues } from "@/lib/editor/variables";

const sources = {
  contact: { name: "Jane van Dyke", email: "jane@acme.com", company: "Acme", phone: null, address: " " },
  sender: { name: "Sam Lee", email: "sam@studio.com" },
  organizationName: "Studio",
  document: { name: "Website redesign", number: "P-0001", total: 125050, currency: "USD" },
};

describe("variables", () => {
  it("fills automatic values and omits blank ones", () => {
    expect(automaticVariableValues(sources)).toEqual({
      "Client.Name": "Jane van Dyke",
      "Client.FirstName": "Jane",
      "Client.LastName": "van Dyke",
      "Client.Email": "jane@acme.com",
      "Client.Company": "Acme",
      "Sender.Name": "Sam Lee",
      "Sender.Email": "sam@studio.com",
      "Organization.Name": "Studio",
      "Document.Name": "Website redesign",
      "Document.Number": "P-0001",
      "Document.Total": "$1,250.50",
    });
  });

  it("leaves client and sender values out when they are unknown", () => {
    const values = automaticVariableValues({ ...sources, contact: null, sender: null });
    expect(Object.keys(values)).toEqual(["Organization.Name", "Document.Name", "Document.Number", "Document.Total"]);
  });

  it("lets non-blank custom values add to and override automatic ones", () => {
    const values = variableValues(sources, { "Deal.Value": "Gold", "Client.Name": "J. van Dyke", "Deal.Empty": "  " });
    expect(values["Deal.Value"]).toBe("Gold");
    expect(values["Client.Name"]).toBe("J. van Dyke");
    expect(values).not.toHaveProperty("Deal.Empty");
  });

  it("lists every automatic variable name", () => {
    expect(AUTOMATIC_VARIABLES).toContain("Client.Name");
    expect(AUTOMATIC_VARIABLES).toContain("Document.Total");
    expect(AUTOMATIC_VARIABLES).toHaveLength(13);
  });
});
```

- [ ] **Step 8: Run the variables tests to verify they fail**

Run: `npx vitest run tests/lib/variables.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/editor/variables"".

- [ ] **Step 9: Implement `src/lib/editor/variables.ts`**

```ts
import { formatMoney } from "@/lib/money";

export const AUTOMATIC_VARIABLES = [
  "Client.Name",
  "Client.FirstName",
  "Client.LastName",
  "Client.Email",
  "Client.Company",
  "Client.Phone",
  "Client.Address",
  "Sender.Name",
  "Sender.Email",
  "Organization.Name",
  "Document.Name",
  "Document.Number",
  "Document.Total",
] as const;

export type VariableSources = {
  contact: { name: string; email: string; company: string | null; phone: string | null; address: string | null } | null;
  sender: { name: string; email: string } | null;
  organizationName: string;
  document: { name: string; number: string; total: number; currency: string };
};

export function automaticVariableValues(sources: VariableSources): Record<string, string> {
  const values: Record<string, string> = {};
  const set = (name: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) values[name] = trimmed;
  };
  const { contact, sender, document } = sources;
  if (contact) {
    const [first, ...rest] = contact.name.trim().split(/\s+/);
    set("Client.Name", contact.name);
    set("Client.FirstName", first);
    set("Client.LastName", rest.join(" "));
    set("Client.Email", contact.email);
    set("Client.Company", contact.company);
    set("Client.Phone", contact.phone);
    set("Client.Address", contact.address);
  }
  if (sender) {
    set("Sender.Name", sender.name);
    set("Sender.Email", sender.email);
  }
  set("Organization.Name", sources.organizationName);
  set("Document.Name", document.name);
  set("Document.Number", document.number);
  set("Document.Total", formatMoney(document.total, document.currency));
  return values;
}

export function variableValues(sources: VariableSources, custom: Record<string, string>): Record<string, string> {
  const values = automaticVariableValues(sources);
  for (const [name, value] of Object.entries(custom)) {
    if (value.trim()) values[name] = value.trim();
  }
  return values;
}
```

- [ ] **Step 10: Run all library tests and the type check**

Run: `npx vitest run tests/lib && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/lib/editor tests/lib/editor-content.test.ts tests/lib/variables.test.ts
git commit -m "feat: add the editor node set, content validation and variables"
```

---

### Task 4: Document types and lifecycle state machine

**Files:**
- Create: `src/lib/documents.ts`
- Create: `src/server/documents/lifecycle.ts`
- Test: `tests/server/lifecycle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DOCUMENT_TYPES`, `type DocumentType`, `DOCUMENT_TYPE_LABELS: Record<DocumentType, string>`
  - `DOCUMENT_STATUSES`, `type DocumentStatus`, `DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string>`
  - `PAYMENT_MODES = ["off", "deposit_percent", "full"] as const`, `type PaymentMode`, `PAYMENT_MODE_LABELS`
  - `DEFAULT_NUMBER_PREFIXES: Record<DocumentType, string>`, `formatDocumentNumber(prefix: string, value: number): string`
  - `DOCUMENT_EVENTS`, `type DocumentEvent`, `class InvalidTransitionError extends Error`
  - `canTransition(status: DocumentStatus, event: DocumentEvent): boolean`
  - `transition(status: DocumentStatus, event: DocumentEvent): DocumentStatus`

Transitions (spec sections 5, 9 and 10):

| Event | From → To |
|---|---|
| `send` | draft → sent |
| `view` | sent → viewed, viewed → viewed |
| `complete` | sent → completed, viewed → completed |
| `request_payment` | sent, viewed, completed → waiting_pay |
| `pay` | waiting_pay → paid |
| `decline` | sent, viewed → declined |
| `void` | sent, viewed, waiting_pay → voided |
| `edit` | draft → draft, sent → draft, viewed → draft |

- [ ] **Step 1: Write the failing lifecycle tests**

Create `tests/server/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  type DocumentStatus,
  formatDocumentNumber,
} from "@/lib/documents";
import { canTransition, DOCUMENT_EVENTS, InvalidTransitionError, transition } from "@/server/documents/lifecycle";

describe("document lifecycle", () => {
  it.each([
    ["draft", "send", "sent"],
    ["sent", "view", "viewed"],
    ["viewed", "view", "viewed"],
    ["viewed", "complete", "completed"],
    ["completed", "request_payment", "waiting_pay"],
    ["sent", "request_payment", "waiting_pay"],
    ["waiting_pay", "pay", "paid"],
    ["viewed", "decline", "declined"],
    ["waiting_pay", "void", "voided"],
    ["sent", "edit", "draft"],
    ["draft", "edit", "draft"],
  ] as const)("%s + %s -> %s", (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it.each([
    ["draft", "view"],
    ["draft", "complete"],
    ["completed", "edit"],
    ["paid", "void"],
    ["declined", "send"],
    ["voided", "pay"],
    ["completed", "decline"],
  ] as const)("refuses %s + %s", (from, event) => {
    expect(canTransition(from, event)).toBe(false);
    expect(() => transition(from, event)).toThrow(InvalidTransitionError);
  });

  it("treats paid, declined and voided as final", () => {
    const finals: DocumentStatus[] = ["paid", "declined", "voided"];
    for (const status of finals) {
      for (const event of DOCUMENT_EVENTS) expect(canTransition(status, event)).toBe(false);
    }
  });

  it("labels every status, showing voided as Expired", () => {
    for (const status of DOCUMENT_STATUSES) expect(DOCUMENT_STATUS_LABELS[status]).toBeTruthy();
    expect(DOCUMENT_STATUS_LABELS.voided).toBe("Expired");
  });

  it("formats document numbers with four digits", () => {
    expect(formatDocumentNumber("INV-", 7)).toBe("INV-0007");
    expect(formatDocumentNumber("P-", 12345)).toBe("P-12345");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/server/lifecycle.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/documents"".

- [ ] **Step 3: Implement `src/lib/documents.ts`**

```ts
export const DOCUMENT_TYPES = ["proposal", "quote", "contract", "invoice"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  proposal: "Proposal",
  quote: "Quote",
  contract: "Contract",
  invoice: "Invoice",
};

export const DOCUMENT_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "completed",
  "waiting_pay",
  "paid",
  "declined",
  "voided",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  completed: "Completed",
  waiting_pay: "Waiting for payment",
  paid: "Paid",
  declined: "Declined",
  voided: "Expired",
};

export const PAYMENT_MODES = ["off", "deposit_percent", "full"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  off: "No payment",
  deposit_percent: "Deposit (percent of total)",
  full: "Full total",
};

export const DEFAULT_NUMBER_PREFIXES: Record<DocumentType, string> = {
  proposal: "P-",
  quote: "Q-",
  contract: "C-",
  invoice: "INV-",
};

export function formatDocumentNumber(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(4, "0")}`;
}
```

- [ ] **Step 4: Implement `src/server/documents/lifecycle.ts`**

```ts
import type { DocumentStatus } from "@/lib/documents";

export const DOCUMENT_EVENTS = ["send", "view", "complete", "request_payment", "pay", "decline", "void", "edit"] as const;
export type DocumentEvent = (typeof DOCUMENT_EVENTS)[number];

export class InvalidTransitionError extends Error {
  constructor(status: DocumentStatus, event: DocumentEvent) {
    super(`A ${status} document cannot ${event.replace("_", " ")}.`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<DocumentEvent, Partial<Record<DocumentStatus, DocumentStatus>>> = {
  send: { draft: "sent" },
  view: { sent: "viewed", viewed: "viewed" },
  complete: { sent: "completed", viewed: "completed" },
  request_payment: { sent: "waiting_pay", viewed: "waiting_pay", completed: "waiting_pay" },
  pay: { waiting_pay: "paid" },
  decline: { sent: "declined", viewed: "declined" },
  void: { sent: "voided", viewed: "voided", waiting_pay: "voided" },
  edit: { draft: "draft", sent: "draft", viewed: "draft" },
};

export function canTransition(status: DocumentStatus, event: DocumentEvent): boolean {
  return TRANSITIONS[event][status] !== undefined;
}

export function transition(status: DocumentStatus, event: DocumentEvent): DocumentStatus {
  const next = TRANSITIONS[event][status];
  if (!next) throw new InvalidTransitionError(status, event);
  return next;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/server/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/documents.ts src/server/documents/lifecycle.ts tests/server/lifecycle.test.ts
git commit -m "feat: add document types and the lifecycle state machine"
```

---

### Task 5: Content database schema and migration

**Files:**
- Create: `src/db/schema/content.ts`
- Modify: `src/db/schema/index.ts`
- Create: `drizzle/0002_content.sql` and `drizzle/meta/0002_snapshot.json` (generated), Modify: `drizzle/meta/_journal.json` (generated)
- Modify: `src/server/errors.ts` (add `NotFoundError`)
- Create: `src/server/db-errors.ts`
- Create: `src/server/validation.ts`
- Test: `tests/db/content-schema.test.ts`

**Interfaces:**
- Consumes (Tasks 2, 3, 4): `type Quote`, `type JSONContent`, `DOCUMENT_TYPES`, `DOCUMENT_STATUSES`, `PAYMENT_MODES`.
- Produces:
  - Tables `contacts`, `products`, `templates`, `documents`, `recipients`, `numberingSequences`; enums `documentType`, `documentStatus`, `paymentMode`, `recipientKind`, `signerState`, `productBillingType`.
  - `class NotFoundError extends Error` (default message "Not found.")
  - `isUniqueViolation(error: unknown): boolean`
  - `parseInput<T>(schema: z.ZodType<T>, input: unknown): T` (throws `ValidationError` with the first issue's message)

Money columns use `bigint` in number mode because amounts up to `MAX_MINOR_AMOUNT` exceed a 32-bit integer. Schema files import with relative paths (drizzle-kit loads them without the `@/` alias).

- [ ] **Step 1: Write the failing schema tests**

Create `tests/db/content-schema.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contacts, documents, organizations, products, recipients } from "@/db/schema";
import type { Db } from "@/db/types";
import { emptyContent } from "@/lib/editor/content";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let orgA: string;
let orgB: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const rows = await db
    .insert(organizations)
    .values([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ])
    .returning({ id: organizations.id });
  [orgA, orgB] = rows.map((row) => row.id);
});
afterEach(async () => {
  await close();
});

const contact = (organizationId: string, email = "jane@acme.com") => ({ organizationId, name: "Jane", email });
const product = (organizationId: string, extra: Record<string, unknown> = {}) => ({
  organizationId,
  title: "Design",
  unitPrice: 1000,
  currency: "USD",
  ...extra,
});
const document = (organizationId: string, number = "P-0001", extra: Record<string, unknown> = {}) => ({
  organizationId,
  type: "proposal" as const,
  name: "Proposal",
  number,
  content: emptyContent(),
  currency: "USD",
  ...extra,
});

describe("contacts constraints", () => {
  it("rejects an email that is not lowercase and trimmed", async () => {
    await expect(db.insert(contacts).values(contact(orgA, "Jane@Acme.com"))).rejects.toThrow();
  });

  it("allows one contact per email per organization", async () => {
    await db.insert(contacts).values(contact(orgA));
    await expect(db.insert(contacts).values(contact(orgA))).rejects.toThrow();
    await expect(db.insert(contacts).values(contact(orgB))).resolves.toBeDefined();
  });
});

describe("products constraints", () => {
  it("rejects negative prices and malformed currency codes", async () => {
    await expect(db.insert(products).values(product(orgA, { unitPrice: -1 }))).rejects.toThrow();
    await expect(db.insert(products).values(product(orgA, { currency: "usd" }))).rejects.toThrow();
  });

  it("stores amounts above the 32-bit integer range", async () => {
    const [row] = await db.insert(products).values(product(orgA, { unitPrice: 500_000_000_000 })).returning();
    expect(row.unitPrice).toBe(500_000_000_000);
  });

  it("keeps SKUs unique per organization but allows many products without one", async () => {
    await db.insert(products).values([product(orgA), product(orgA)]);
    await db.insert(products).values(product(orgA, { sku: "WEB-1" }));
    await expect(db.insert(products).values(product(orgA, { sku: "WEB-1" }))).rejects.toThrow();
    await expect(db.insert(products).values(product(orgB, { sku: "WEB-1" }))).resolves.toBeDefined();
  });
});

describe("documents constraints", () => {
  it("keeps document numbers unique per organization", async () => {
    await db.insert(documents).values(document(orgA));
    await expect(db.insert(documents).values(document(orgA))).rejects.toThrow();
    await expect(db.insert(documents).values(document(orgB))).resolves.toBeDefined();
  });

  it("requires a percent for deposit payments and keeps it between 1 and 100", async () => {
    await expect(db.insert(documents).values(document(orgA, "P-1", { paymentMode: "deposit_percent" }))).rejects.toThrow();
    await expect(
      db.insert(documents).values(document(orgA, "P-2", { paymentMode: "deposit_percent", paymentPercent: 101 })),
    ).rejects.toThrow();
    await expect(
      db.insert(documents).values(document(orgA, "P-3", { paymentMode: "deposit_percent", paymentPercent: 30 })),
    ).resolves.toBeDefined();
  });

  it("defaults to draft with no payment and a zero total", async () => {
    const [row] = await db.insert(documents).values(document(orgA)).returning();
    expect(row).toMatchObject({ status: "draft", paymentMode: "off", total: 0, roles: ["Client"], variables: {} });
  });
});

describe("recipients constraints", () => {
  async function seedDocument() {
    const [c] = await db.insert(contacts).values(contact(orgA)).returning();
    const [d] = await db.insert(documents).values(document(orgA, "P-0001", { contactId: c.id })).returning();
    return { contactId: c.id, documentId: d.id };
  }
  const recipient = (documentId: string, extra: Record<string, unknown> = {}) => ({
    organizationId: orgA,
    documentId,
    name: "Jane",
    email: "jane@acme.com",
    role: "Client",
    ...extra,
  });

  it("requires a role for signers but not for copies", async () => {
    const { documentId } = await seedDocument();
    await expect(db.insert(recipients).values(recipient(documentId, { role: null }))).rejects.toThrow();
    await expect(
      db.insert(recipients).values(recipient(documentId, { role: null, kind: "cc", email: "cc@acme.com" })),
    ).resolves.toBeDefined();
  });

  it("allows one recipient per role and per email on a document", async () => {
    const { documentId } = await seedDocument();
    await db.insert(recipients).values(recipient(documentId));
    await expect(db.insert(recipients).values(recipient(documentId, { email: "other@acme.com" }))).rejects.toThrow();
    await expect(db.insert(recipients).values(recipient(documentId, { role: "Agency" }))).rejects.toThrow();
  });

  it("keeps documents and recipients when their contact is deleted", async () => {
    const { contactId, documentId } = await seedDocument();
    await db.insert(recipients).values(recipient(documentId, { contactId }));
    await db.delete(contacts).where(eq(contacts.id, contactId));
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    const [rec] = await db.select().from(recipients).where(eq(recipients.documentId, documentId));
    expect(doc.contactId).toBeNull();
    expect(rec).toMatchObject({ contactId: null, name: "Jane", email: "jane@acme.com" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/db/content-schema.test.ts`
Expected: FAIL because `contacts` is not exported from `@/db/schema`.

- [ ] **Step 3: Create `src/db/schema/content.ts`**

```ts
import type { JSONContent } from "@tiptap/core";
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, PAYMENT_MODES } from "../../lib/documents";
import type { Quote } from "../../lib/quote/schema";
import { user } from "./auth";
import { organizations } from "./org";

export const documentType = pgEnum("document_type", DOCUMENT_TYPES);
export const documentStatus = pgEnum("document_status", DOCUMENT_STATUSES);
export const paymentMode = pgEnum("payment_mode", PAYMENT_MODES);
export const recipientKind = pgEnum("recipient_kind", ["signer", "cc"]);
export const signerState = pgEnum("signer_state", ["pending", "viewed", "signed", "declined"]);
export const productBillingType = pgEnum("product_billing_type", ["one_time", "monthly", "yearly"]);

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const organizationId = () =>
  text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const money = (name: string) => bigint(name, { mode: "number" });
const defaultRoles = sql`'{Client}'::text[]`;

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    phone: text("phone"),
    address: text("address"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("contacts_org_email_idx").on(table.organizationId, table.email),
    check("contacts_email_normalized", sql`${table.email} = lower(btrim(${table.email}))`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    organizationId: organizationId(),
    title: text("title").notNull(),
    sku: text("sku"),
    description: text("description").notNull().default(""),
    unitPrice: money("unit_price").notNull(),
    currency: text("currency").notNull(),
    billingType: productBillingType("billing_type").notNull().default("one_time"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("products_org_sku_idx").on(table.organizationId, table.sku).where(sql`sku IS NOT NULL`),
    check("products_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
    check("products_currency_code", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    documentType: documentType("document_type").notNull().default("proposal"),
    content: jsonb("content").$type<JSONContent>().notNull(),
    roles: text("roles").array().notNull().default(defaultRoles),
    quote: jsonb("quote").$type<Quote>(),
    paymentMode: paymentMode("payment_mode").notNull().default("off"),
    paymentPercent: integer("payment_percent"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("templates_org_idx").on(table.organizationId),
    check("templates_payment_percent_range", sql`${table.paymentPercent} IS NULL OR ${table.paymentPercent} BETWEEN 1 AND 100`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    organizationId: organizationId(),
    type: documentType("type").notNull(),
    name: text("name").notNull(),
    status: documentStatus("status").notNull().default("draft"),
    number: text("number").notNull(),
    templateId: text("template_id").references(() => templates.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    content: jsonb("content").$type<JSONContent>().notNull(),
    quote: jsonb("quote").$type<Quote>(),
    roles: text("roles").array().notNull().default(defaultRoles),
    // Custom variable values; automatic ones (client, sender, document) are computed when needed.
    variables: jsonb("variables").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    currency: text("currency").notNull(),
    total: money("total").notNull().default(0),
    paymentMode: paymentMode("payment_mode").notNull().default("off"),
    paymentPercent: integer("payment_percent"),
    // Set by Plan 3 when a revision is created on send.
    currentRevisionId: text("current_revision_id"),
    dateSent: timestamp("date_sent", { withTimezone: true }),
    dateCompleted: timestamp("date_completed", { withTimezone: true }),
    dateDeclined: timestamp("date_declined", { withTimezone: true }),
    dateExpiration: timestamp("date_expiration", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("documents_org_number_idx").on(table.organizationId, table.number),
    index("documents_org_status_idx").on(table.organizationId, table.status),
    check("documents_currency_code", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("documents_total_nonnegative", sql`${table.total} >= 0`),
    check("documents_payment_percent_range", sql`${table.paymentPercent} IS NULL OR ${table.paymentPercent} BETWEEN 1 AND 100`),
    check("documents_deposit_has_percent", sql`${table.paymentMode} <> 'deposit_percent' OR ${table.paymentPercent} IS NOT NULL`),
  ],
);

export const recipients = pgTable(
  "recipients",
  {
    id: id(),
    organizationId: organizationId(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    // Snapshot of the contact when added, so the document survives contact edits and deletion.
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role"),
    kind: recipientKind("kind").notNull().default("signer"),
    ordering: integer("ordering").notNull().default(1),
    signerState: signerState("signer_state").notNull().default("pending"),
    // Issued by Plan 3 on send.
    tokenHash: text("token_hash").unique(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("recipients_document_idx").on(table.documentId),
    uniqueIndex("recipients_document_role_idx").on(table.documentId, table.role).where(sql`role IS NOT NULL`),
    uniqueIndex("recipients_document_email_idx").on(table.documentId, table.email),
    check("recipients_email_normalized", sql`${table.email} = lower(btrim(${table.email}))`),
    check("recipients_signer_has_role", sql`${table.kind} = 'cc' OR ${table.role} IS NOT NULL`),
  ],
);

export const numberingSequences = pgTable(
  "numbering_sequences",
  {
    id: id(),
    organizationId: organizationId(),
    documentType: documentType("document_type").notNull(),
    prefix: text("prefix").notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (table) => [
    uniqueIndex("numbering_sequences_org_type_idx").on(table.organizationId, table.documentType),
    check("numbering_sequences_next_value_positive", sql`${table.nextValue} >= 1`),
  ],
);
```

- [ ] **Step 4: Export the new schema**

Replace `src/db/schema/index.ts` with:

```ts
export * from "./auth";
export * from "./content";
export * from "./org";
```

- [ ] **Step 5: Generate the migration**

Run: `npx drizzle-kit generate --name content`
Expected: creates `drizzle/0002_content.sql` with `CREATE TYPE` statements for the six enums, `CREATE TABLE` for the six tables, the foreign keys, indexes and check constraints. Open the file and confirm it contains no `DROP` statements and does not change Plan 1 tables.

- [ ] **Step 6: Add the shared server helpers**

Append to `src/server/errors.ts`:

```ts

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
```

Create `src/server/db-errors.ts`:

```ts
// Postgres unique_violation, raised directly or wrapped by the Drizzle driver.
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
```

Create `src/server/validation.ts`:

```ts
import type { z } from "zod";
import { ValidationError } from "./errors";

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}
```

`src/server/auth/signup-hooks.ts` keeps its own private copy of `isUniqueViolation`; do not edit it (Global Constraints).

- [ ] **Step 7: Run the schema tests and the full suite**

Run: `npx vitest run tests/db && npm test`
Expected: PASS. The test database applies `0002_content.sql` through the existing migrator in `tests/helpers/test-db.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema src/server/errors.ts src/server/db-errors.ts src/server/validation.ts drizzle tests/db/content-schema.test.ts
git commit -m "feat: add contacts, products, templates, documents and recipients tables"
```

---
### Task 6: Contacts

**Files:**
- Modify: `tests/helpers/test-db.ts` (add `seedTwoOrganizations`)
- Create: `src/server/contacts/contacts.ts`
- Create: `src/app/app/action-state.ts`
- Create: `src/app/app/load.ts`
- Create: `src/app/app/ui.tsx`
- Create: `src/app/app/confirm-button.tsx`
- Create: `src/app/app/contacts/actions.ts`
- Create: `src/app/app/contacts/contact-form.tsx`
- Create: `src/app/app/contacts/page.tsx`
- Create: `src/app/app/contacts/[id]/page.tsx`
- Modify: `src/app/app/layout.tsx` (nav link)
- Test: `tests/server/contacts.test.ts`

**Interfaces:**
- Consumes (Task 5): `contacts`, `NotFoundError`, `ValidationError`, `isUniqueViolation`, `parseInput`; `requireMember()` and `OrgContext` from Plan 1.
- Produces:
  - `type Contact = typeof contacts.$inferSelect`
  - `listContacts(db, ctx, options?: { search?: string }): Promise<Contact[]>`
  - `getContact(db, ctx, id: string): Promise<Contact>` (throws `NotFoundError("Contact not found.")`)
  - `createContact(db, ctx, input: unknown): Promise<Contact>`
  - `updateContact(db, ctx, id: string, input: unknown): Promise<Contact>`
  - `deleteContact(db, ctx, id: string): Promise<void>`
  - `escapeLike(value: string): string`
  - Test helper `seedTwoOrganizations(db): Promise<{ a: OrgContext; aMember: OrgContext; b: OrgContext }>`
  - App helpers: `type ActionState`, `actionError(scope: string, error: unknown): ActionState`, `loadOrNotFound<T>(load: Promise<T>): Promise<T>`, class strings `inputClass`, `buttonClass`, `secondaryButtonClass`, `dangerButtonClass`, `<FormStatus state />`, `<ConfirmButton message label className />`

Contact input: `name` (required, ≤ 200), `email` (required, valid, stored lowercased and trimmed), `company` (≤ 200), `phone` (≤ 50), `address` (≤ 500). Blank optional fields are stored as `null`. Every member may manage contacts.

- [ ] **Step 1: Add the two-organization test helper**

Append to `tests/helpers/test-db.ts`:

```ts

/** Organization A has an owner (a) and a member (aMember); organization B has an owner (b). */
export async function seedTwoOrganizations(
  db: Db,
): Promise<{ a: OrgContext; aMember: OrgContext; b: OrgContext }> {
  const orgs = await db
    .insert(schema.organizations)
    .values([
      { slug: "org-a", name: "Org A" },
      { slug: "org-b", name: "Org B" },
    ])
    .returning({ id: schema.organizations.id, slug: schema.organizations.slug });
  const orgA = orgs.find((org) => org.slug === "org-a")!.id;
  const orgB = orgs.find((org) => org.slug === "org-b")!.id;
  const alice = await insertUser(db, "alice@a.test", "Alice");
  const amy = await insertUser(db, "amy@a.test", "Amy");
  const bob = await insertUser(db, "bob@b.test", "Bob");
  await db.insert(schema.members).values([
    { organizationId: orgA, userId: alice, role: "owner" },
    { organizationId: orgA, userId: amy, role: "member" },
    { organizationId: orgB, userId: bob, role: "owner" },
  ]);
  return {
    a: { organizationId: orgA, userId: alice, role: "owner" },
    aMember: { organizationId: orgA, userId: amy, role: "member" },
    b: { organizationId: orgB, userId: bob, role: "owner" },
  };
}
```

and add `import type { OrgContext } from "@/server/tenancy";` to the imports at the top of the file.

- [ ] **Step 2: Write the failing contact tests**

Create `tests/server/contacts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from "@/server/contacts/contacts";
import { NotFoundError, ValidationError } from "@/server/errors";
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

const jane = { name: "Jane Doe", email: " Jane@Acme.com ", company: "Acme", phone: "", address: "" };

describe("contacts", () => {
  it("lets a member create a contact with a normalized email and null blanks", async () => {
    const contact = await createContact(db, aMember, jane);
    expect(contact).toMatchObject({
      organizationId: a.organizationId,
      name: "Jane Doe",
      email: "jane@acme.com",
      company: "Acme",
      phone: null,
      address: null,
    });
  });

  it.each([
    [{ ...jane, name: " " }, "Name is required."],
    [{ ...jane, email: "not-an-email" }, "Enter a valid email address."],
    [{ ...jane, phone: "1".repeat(51) }, "Phone must be at most 50 characters."],
  ])("rejects invalid input %#", async (input, message) => {
    await expect(createContact(db, a, input)).rejects.toThrow(new ValidationError(message));
  });

  it("rejects a duplicate email in the same organization only", async () => {
    await createContact(db, a, jane);
    await expect(createContact(db, a, { ...jane, name: "Other" })).rejects.toThrow(
      new ValidationError("A contact with the email jane@acme.com already exists."),
    );
    await expect(createContact(db, b, jane)).resolves.toMatchObject({ organizationId: b.organizationId });
  });

  it("searches name, email and company case-insensitively and treats % literally", async () => {
    await createContact(db, a, jane);
    await createContact(db, a, { name: "Bob Smith", email: "bob@globex.com", company: "Globex 100%" });
    expect((await listContacts(db, a, { search: "JANE" })).map((c) => c.name)).toEqual(["Jane Doe"]);
    expect((await listContacts(db, a, { search: "globex" })).map((c) => c.name)).toEqual(["Bob Smith"]);
    expect((await listContacts(db, a, { search: "100%" })).map((c) => c.name)).toEqual(["Bob Smith"]);
    expect(await listContacts(db, a, { search: "%" })).toHaveLength(1);
    expect((await listContacts(db, a)).map((c) => c.name)).toEqual(["Bob Smith", "Jane Doe"]);
  });

  it("updates and deletes a contact", async () => {
    const contact = await createContact(db, a, jane);
    const updated = await updateContact(db, a, contact.id, { ...jane, name: "Jane Roe", phone: "+1 555 0100" });
    expect(updated).toMatchObject({ name: "Jane Roe", phone: "+1 555 0100" });
    await deleteContact(db, a, contact.id);
    await expect(getContact(db, a, contact.id)).rejects.toThrow(NotFoundError);
  });

  it("hides one organization's contacts from another", async () => {
    const contact = await createContact(db, a, jane);
    await expect(getContact(db, b, contact.id)).rejects.toThrow(new NotFoundError("Contact not found."));
    await expect(updateContact(db, b, contact.id, { ...jane, name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(deleteContact(db, b, contact.id)).rejects.toThrow(NotFoundError);
    expect(await listContacts(db, b)).toEqual([]);
    expect((await getContact(db, a, contact.id)).name).toBe("Jane Doe");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/server/contacts.test.ts`
Expected: FAIL with "Failed to resolve import "@/server/contacts/contacts"".

- [ ] **Step 4: Implement `src/server/contacts/contacts.ts`**

```ts
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { contacts } from "@/db/schema";
import type { Db } from "@/db/types";
import { isUniqueViolation } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";

export type Contact = typeof contacts.$inferSelect;

const optionalText = (label: string, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max, `${label} must be at most ${max} characters.`).nullable().default(null),
  );

const ContactInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Name must be at most 200 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  company: optionalText("Company", 200),
  phone: optionalText("Phone", 50),
  address: optionalText("Address", 500),
});

/** Escapes LIKE wildcards so user search text matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function scoped(ctx: OrgContext, id: string) {
  return and(eq(contacts.id, id), eq(contacts.organizationId, ctx.organizationId));
}

export async function listContacts(db: Db, ctx: OrgContext, options: { search?: string } = {}): Promise<Contact[]> {
  const search = options.search?.trim();
  const inOrg = eq(contacts.organizationId, ctx.organizationId);
  const pattern = `%${escapeLike(search ?? "")}%`;
  const where = search
    ? and(inOrg, or(ilike(contacts.name, pattern), ilike(contacts.email, pattern), ilike(contacts.company, pattern)))
    : inOrg;
  return db.select().from(contacts).where(where).orderBy(asc(contacts.name)).limit(500);
}

export async function getContact(db: Db, ctx: OrgContext, id: string): Promise<Contact> {
  const [contact] = await db.select().from(contacts).where(scoped(ctx, id)).limit(1);
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}

function duplicateEmail(error: unknown, email: string): never {
  if (isUniqueViolation(error)) throw new ValidationError(`A contact with the email ${email} already exists.`);
  throw error;
}

export async function createContact(db: Db, ctx: OrgContext, input: unknown): Promise<Contact> {
  const data = parseInput(ContactInput, input);
  try {
    const [contact] = await db
      .insert(contacts)
      .values({ ...data, organizationId: ctx.organizationId })
      .returning();
    return contact;
  } catch (error) {
    return duplicateEmail(error, data.email);
  }
}

export async function updateContact(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<Contact> {
  const data = parseInput(ContactInput, input);
  let contact: Contact | undefined;
  try {
    [contact] = await db.update(contacts).set(data).where(scoped(ctx, id)).returning();
  } catch (error) {
    duplicateEmail(error, data.email);
  }
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}

export async function deleteContact(db: Db, ctx: OrgContext, id: string): Promise<void> {
  const deleted = await db.delete(contacts).where(scoped(ctx, id)).returning({ id: contacts.id });
  if (deleted.length === 0) throw new NotFoundError("Contact not found.");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/server/contacts.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the shared app helpers**

Create `src/app/app/action-state.ts`:

```ts
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

export type ActionState = { ok: boolean; message: string } | null;

/** Maps expected errors to their message; logs anything else and returns a generic message. */
export function actionError(scope: string, error: unknown): ActionState {
  if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) {
    return { ok: false, message: error.message };
  }
  console.error(`[${scope}]`, error);
  return { ok: false, message: "Something went wrong. Check the server logs." };
}
```

Create `src/app/app/load.ts`:

```ts
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/errors";

/** Shows the 404 page when a tenant-scoped lookup finds nothing. */
export async function loadOrNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
```

Create `src/app/app/ui.tsx`:

```tsx
import type { ActionState } from "./action-state";

export const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
export const buttonClass = "rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60";
export const secondaryButtonClass =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 disabled:opacity-60";
export const dangerButtonClass =
  "rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60";

export function FormStatus({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"} break-all`}>
      {state.message}
    </p>
  );
}
```

Create `src/app/app/confirm-button.tsx`:

```tsx
"use client";

/** A submit button that asks for confirmation before its form submits. */
export function ConfirmButton({ message, label, className }: { message: string; label: string; className: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 7: Add the contact pages and actions**

Create `src/app/app/contacts/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createContact, deleteContact, updateContact } from "@/server/contacts/contacts";
import { type ActionState, actionError } from "../action-state";

function contactInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
  };
}

export async function createContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await createContact(db, ctx, contactInput(formData));
    revalidatePath("/app/contacts");
    return { ok: true, message: "Contact added." };
  } catch (error) {
    return actionError("contacts", error);
  }
}

export async function updateContactAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateContact(db, ctx, id, contactInput(formData));
    revalidatePath("/app/contacts");
    return { ok: true, message: "Contact saved." };
  } catch (error) {
    return actionError("contacts", error);
  }
}

export async function deleteContactAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteContact(db, ctx, id);
  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}
```

Create `src/app/app/contacts/contact-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { ActionState } from "../action-state";
import { buttonClass, FormStatus, inputClass } from "../ui";

export type ContactFields = {
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  address: string | null;
};

export function ContactForm({
  action,
  contact,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  contact?: ContactFields;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        Name
        <input name="name" required defaultValue={contact?.name} className={inputClass} />
      </label>
      <label className="block text-sm">
        Email
        <input name="email" type="email" required defaultValue={contact?.email} className={inputClass} />
      </label>
      <label className="block text-sm">
        Company
        <input name="company" defaultValue={contact?.company ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Phone
        <input name="phone" type="tel" defaultValue={contact?.phone ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Address
        <textarea name="address" rows={3} defaultValue={contact?.address ?? ""} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
```

Create `src/app/app/contacts/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { listContacts } from "@/server/contacts/contacts";
import { inputClass, secondaryButtonClass } from "../ui";
import { createContactAction } from "./actions";
import { ContactForm } from "./contact-form";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireMember();
  const { q = "" } = await searchParams;
  const contacts = await listContacts(db, ctx, { search: q });

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Contacts</h1>
        <form role="search" className="mb-4 flex gap-2">
          <label htmlFor="contact-search" className="sr-only">
            Search contacts
          </label>
          <input id="contact-search" name="q" defaultValue={q} placeholder="Search by name, email or company" className={inputClass} />
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
        {contacts.length === 0 ? (
          <p className="text-sm text-neutral-600">{q ? "No contacts match your search." : "No contacts yet."}</p>
        ) : (
          <ul className="divide-y rounded-md border border-neutral-200 bg-white">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                <Link href={`/app/contacts/${contact.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                  {contact.name}
                </Link>
                <span className="text-neutral-500">{[contact.company, contact.email].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add a contact</h2>
        <ContactForm action={createContactAction} submitLabel="Add contact" />
      </section>
    </div>
  );
}
```

Create `src/app/app/contacts/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { getContact } from "@/server/contacts/contacts";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass } from "../../ui";
import { deleteContactAction, updateContactAction } from "../actions";
import { ContactForm } from "../contact-form";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const contact = await loadOrNotFound(getContact(db, ctx, id));

  return (
    <div className="space-y-8">
      <Link href="/app/contacts" className="text-sm text-neutral-600 hover:underline">
        ← Contacts
      </Link>
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{contact.name}</h1>
        <ContactForm action={updateContactAction.bind(null, contact.id)} contact={contact} submitLabel="Save contact" />
      </section>
      <form action={deleteContactAction.bind(null, contact.id)}>
        <ConfirmButton
          message="Delete this contact? Documents keep the recipient's name and email."
          label="Delete contact"
          className={dangerButtonClass}
        />
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Add the nav link**

In `src/app/app/layout.tsx`, add the Contacts link after Dashboard so the nav reads:

```tsx
          <Link href="/app">Dashboard</Link>
          <Link href="/app/contacts">Contacts</Link>
          <Link href="/app/settings">Settings</Link>
```

- [ ] **Step 9: Verify lint, types, tests and build**

Run: `npm run lint && npm run typecheck && npm test`
Then run the build with placeholder env (PowerShell shown; use `export` in bash):

```powershell
$env:DATABASE_URL='postgres://build:build@localhost:5432/build'; $env:BETTER_AUTH_SECRET='ci-build-placeholder-secret-0123456789abcdef'; $env:BETTER_AUTH_URL='http://localhost:3000'; npm run build
```

Expected: all pass; the build lists `/app/contacts` and `/app/contacts/[id]`.

- [ ] **Step 10: Commit**

```bash
git add tests/helpers/test-db.ts tests/server/contacts.test.ts src/server/contacts src/app/app
git commit -m "feat: add contacts"
```

---

### Task 7: Product catalog

**Files:**
- Create: `src/server/catalog/products.ts`
- Create: `src/app/app/catalog/actions.ts`
- Create: `src/app/app/catalog/product-form.tsx`
- Create: `src/app/app/catalog/page.tsx`
- Create: `src/app/app/catalog/[id]/page.tsx`
- Modify: `src/app/app/layout.tsx` (nav link)
- Test: `tests/server/products.test.ts`

**Interfaces:**
- Consumes: `products` (Task 5), `isCurrencyCode`, `parseMoney`, `formatMoney`, `minorToDecimalString` (Task 1), `escapeLike` (Task 6), `getOrganizationSettings` (Plan 1), app helpers (Task 6).
- Produces:
  - `type Product = typeof products.$inferSelect`
  - `PRODUCT_BILLING_TYPES = ["one_time", "monthly", "yearly"] as const`, `BILLING_TYPE_LABELS`
  - `listProducts(db, ctx, options?: { search?: string; currency?: string }): Promise<Product[]>`
  - `getProduct(db, ctx, id: string): Promise<Product>` (throws `NotFoundError("Product not found.")`)
  - `createProduct(db, ctx, input: unknown): Promise<Product>`
  - `updateProduct(db, ctx, id: string, input: unknown): Promise<Product>`
  - `deleteProduct(db, ctx, id: string): Promise<void>`

Product input: `title` (required, ≤ 200), `sku` (optional, ≤ 64, unique per organization), `description` (≤ 2000), `currency` (ISO code, uppercased), `price` (decimal string parsed with `parseMoney` for that currency), `billingType` (default `one_time`). Billing type is informational in Phase 1; subscriptions are out of scope. Quotes copy a product's title, description and price when it is added, so later catalog edits do not change existing quotes.

- [ ] **Step 1: Write the failing product tests**

Create `tests/server/products.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "@/server/catalog/products";
import { NotFoundError, ValidationError } from "@/server/errors";
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

const design = { title: "Website design", sku: "WEB-1", description: "Up to 5 pages", currency: "usd", price: "1,250.50" };

describe("products", () => {
  it("lets a member create a product priced in minor units", async () => {
    const product = await createProduct(db, aMember, design);
    expect(product).toMatchObject({ title: "Website design", sku: "WEB-1", currency: "USD", unitPrice: 125050, billingType: "one_time" });
  });

  it("prices zero-decimal currencies in whole units", async () => {
    const product = await createProduct(db, a, { ...design, sku: "", currency: "JPY", price: "1250" });
    expect(product).toMatchObject({ unitPrice: 1250, currency: "JPY", sku: null });
  });

  it.each([
    [{ ...design, title: "" }, "Title is required."],
    [{ ...design, currency: "ABC" }, "Unknown currency code."],
    [{ ...design, price: "12.345" }, "Enter a valid price in USD, for example 1250.00."],
    [{ ...design, price: "-5" }, "Enter a valid price in USD, for example 1250.00."],
    [{ ...design, billingType: "weekly" }, "Choose a billing type."],
  ])("rejects invalid input %#", async (input, message) => {
    await expect(createProduct(db, a, input)).rejects.toThrow(new ValidationError(message));
  });

  it("keeps SKUs unique within an organization only", async () => {
    await createProduct(db, a, design);
    await expect(createProduct(db, a, design)).rejects.toThrow(
      new ValidationError("A product with the SKU WEB-1 already exists."),
    );
    await expect(createProduct(db, b, design)).resolves.toMatchObject({ organizationId: b.organizationId });
  });

  it("filters by currency and searches title, SKU and description", async () => {
    await createProduct(db, a, design);
    await createProduct(db, a, { title: "Hosting", sku: "HOST", description: "Monthly", currency: "EUR", price: "20", billingType: "monthly" });
    expect((await listProducts(db, a, { currency: "EUR" })).map((p) => p.title)).toEqual(["Hosting"]);
    expect((await listProducts(db, a, { search: "web-" })).map((p) => p.title)).toEqual(["Website design"]);
    expect((await listProducts(db, a, { search: "monthly" })).map((p) => p.title)).toEqual(["Hosting"]);
  });

  it("updates and deletes a product", async () => {
    const product = await createProduct(db, a, design);
    expect(await updateProduct(db, a, product.id, { ...design, price: "99" })).toMatchObject({ unitPrice: 9900 });
    await deleteProduct(db, a, product.id);
    await expect(getProduct(db, a, product.id)).rejects.toThrow(NotFoundError);
  });

  it("hides one organization's products from another", async () => {
    const product = await createProduct(db, a, design);
    await expect(getProduct(db, b, product.id)).rejects.toThrow(new NotFoundError("Product not found."));
    await expect(updateProduct(db, b, product.id, { ...design, price: "1" })).rejects.toThrow(NotFoundError);
    await expect(deleteProduct(db, b, product.id)).rejects.toThrow(NotFoundError);
    expect(await listProducts(db, b)).toEqual([]);
    expect((await getProduct(db, a, product.id)).unitPrice).toBe(125050);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/server/products.test.ts`
Expected: FAIL with "Failed to resolve import "@/server/catalog/products"".

- [ ] **Step 3: Implement `src/server/catalog/products.ts`**

```ts
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { products } from "@/db/schema";
import type { Db } from "@/db/types";
import { isCurrencyCode, minorToDecimalString, parseMoney } from "@/lib/money";
import { escapeLike } from "@/server/contacts/contacts";
import { isUniqueViolation } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";

export type Product = typeof products.$inferSelect;

export const PRODUCT_BILLING_TYPES = ["one_time", "monthly", "yearly"] as const;
export const BILLING_TYPE_LABELS: Record<(typeof PRODUCT_BILLING_TYPES)[number], string> = {
  one_time: "One-time",
  monthly: "Monthly",
  yearly: "Yearly",
};

const ProductInput = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200, "Title must be at most 200 characters."),
    sku: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z.string().trim().max(64, "SKU must be at most 64 characters.").nullable().default(null),
    ),
    description: z.string().trim().max(2000, "Description must be at most 2000 characters.").default(""),
    currency: z.string().trim().toUpperCase().refine(isCurrencyCode, "Unknown currency code."),
    price: z.string(),
    billingType: z.enum(PRODUCT_BILLING_TYPES, "Choose a billing type.").default("one_time"),
  })
  .transform((input, ctx) => {
    // The currency refinement has already reported an unknown code.
    if (!isCurrencyCode(input.currency)) return z.NEVER;
    const unitPrice = parseMoney(input.price, input.currency);
    if (unitPrice === null) {
      // 125000 minor units reads "1250.00" for USD and "125000" for JPY.
      const example = minorToDecimalString(125000, input.currency);
      ctx.addIssue({ code: "custom", message: `Enter a valid price in ${input.currency}, for example ${example}.` });
      return z.NEVER;
    }
    return {
      title: input.title,
      sku: input.sku,
      description: input.description,
      currency: input.currency,
      billingType: input.billingType,
      unitPrice,
    };
  });

function scoped(ctx: OrgContext, id: string) {
  return and(eq(products.id, id), eq(products.organizationId, ctx.organizationId));
}

function duplicateSku(error: unknown, sku: string | null): never {
  if (isUniqueViolation(error)) throw new ValidationError(`A product with the SKU ${sku} already exists.`);
  throw error;
}

export async function listProducts(
  db: Db,
  ctx: OrgContext,
  options: { search?: string; currency?: string } = {},
): Promise<Product[]> {
  const conditions = [eq(products.organizationId, ctx.organizationId)];
  if (options.currency) conditions.push(eq(products.currency, options.currency));
  const search = options.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(or(ilike(products.title, pattern), ilike(products.sku, pattern), ilike(products.description, pattern))!);
  }
  return db.select().from(products).where(and(...conditions)).orderBy(asc(products.title)).limit(500);
}

export async function getProduct(db: Db, ctx: OrgContext, id: string): Promise<Product> {
  const [product] = await db.select().from(products).where(scoped(ctx, id)).limit(1);
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

export async function createProduct(db: Db, ctx: OrgContext, input: unknown): Promise<Product> {
  const data = parseInput(ProductInput, input);
  try {
    const [product] = await db.insert(products).values({ ...data, organizationId: ctx.organizationId }).returning();
    return product;
  } catch (error) {
    return duplicateSku(error, data.sku);
  }
}

export async function updateProduct(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<Product> {
  const data = parseInput(ProductInput, input);
  let product: Product | undefined;
  try {
    [product] = await db.update(products).set(data).where(scoped(ctx, id)).returning();
  } catch (error) {
    duplicateSku(error, data.sku);
  }
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

export async function deleteProduct(db: Db, ctx: OrgContext, id: string): Promise<void> {
  const deleted = await db.delete(products).where(scoped(ctx, id)).returning({ id: products.id });
  if (deleted.length === 0) throw new NotFoundError("Product not found.");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/server/products.test.ts`
Expected: PASS. If Zod 4 runs the transform after the currency refinement fails, the `isCurrencyCode` guard keeps `parseMoney` from throwing on an unknown code; the reported message stays "Unknown currency code.".

- [ ] **Step 5: Add the catalog pages and actions**

Create `src/app/app/catalog/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createProduct, deleteProduct, updateProduct } from "@/server/catalog/products";
import { type ActionState, actionError } from "../action-state";

function productInput(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    description: String(formData.get("description") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    price: String(formData.get("price") ?? ""),
    billingType: String(formData.get("billingType") ?? "one_time"),
  };
}

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await createProduct(db, ctx, productInput(formData));
    revalidatePath("/app/catalog");
    return { ok: true, message: "Product added." };
  } catch (error) {
    return actionError("catalog", error);
  }
}

export async function updateProductAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateProduct(db, ctx, id, productInput(formData));
    revalidatePath("/app/catalog");
    return { ok: true, message: "Product saved." };
  } catch (error) {
    return actionError("catalog", error);
  }
}

export async function deleteProductAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteProduct(db, ctx, id);
  revalidatePath("/app/catalog");
  redirect("/app/catalog");
}
```

Create `src/app/app/catalog/product-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { ActionState } from "../action-state";
import { buttonClass, FormStatus, inputClass } from "../ui";

export type ProductFields = {
  title: string;
  sku: string | null;
  description: string;
  currency: string;
  price: string;
  billingType: "one_time" | "monthly" | "yearly";
};

export function ProductForm({
  action,
  product,
  currencies,
  defaultCurrency,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  product?: ProductFields;
  currencies: string[];
  defaultCurrency: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        Title
        <input name="title" required defaultValue={product?.title} className={inputClass} />
      </label>
      <label className="block text-sm">
        SKU (optional)
        <input name="sku" defaultValue={product?.sku ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Description
        <textarea name="description" rows={3} defaultValue={product?.description ?? ""} className={inputClass} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">
          Price
          <input name="price" inputMode="decimal" required defaultValue={product?.price ?? ""} placeholder="1250.00" className={inputClass} />
        </label>
        <label className="block text-sm">
          Currency
          <select name="currency" defaultValue={product?.currency ?? defaultCurrency} className={inputClass}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Billing
          <select name="billingType" defaultValue={product?.billingType ?? "one_time"} className={inputClass}>
            <option value="one_time">One-time</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
```

Create `src/app/app/catalog/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { formatMoney } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { BILLING_TYPE_LABELS, listProducts } from "@/server/catalog/products";
import { getOrganizationSettings } from "@/server/org/settings";
import { inputClass, secondaryButtonClass } from "../ui";
import { createProductAction } from "./actions";
import { ProductForm } from "./product-form";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireMember();
  const { q = "" } = await searchParams;
  const [products, org] = await Promise.all([listProducts(db, ctx, { search: q }), getOrganizationSettings(db, ctx)]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Catalog</h1>
        <form role="search" className="mb-4 flex gap-2">
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <input id="product-search" name="q" defaultValue={q} placeholder="Search by title, SKU or description" className={inputClass} />
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
        {products.length === 0 ? (
          <p className="text-sm text-neutral-600">{q ? "No products match your search." : "No products yet."}</p>
        ) : (
          <ul className="divide-y rounded-md border border-neutral-200 bg-white">
            {products.map((product) => (
              <li key={product.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                <Link href={`/app/catalog/${product.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                  {product.title}
                  {product.sku && <span className="ml-2 text-neutral-500">{product.sku}</span>}
                </Link>
                <span className="text-neutral-600">
                  {formatMoney(product.unitPrice, product.currency)} · {BILLING_TYPE_LABELS[product.billingType]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add a product</h2>
        <ProductForm
          action={createProductAction}
          currencies={Intl.supportedValuesOf("currency")}
          defaultCurrency={org.defaultCurrency}
          submitLabel="Add product"
        />
      </section>
    </div>
  );
}
```

Create `src/app/app/catalog/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { minorToDecimalString } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { getProduct } from "@/server/catalog/products";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass } from "../../ui";
import { deleteProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const product = await loadOrNotFound(getProduct(db, ctx, id));

  return (
    <div className="space-y-8">
      <Link href="/app/catalog" className="text-sm text-neutral-600 hover:underline">
        ← Catalog
      </Link>
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{product.title}</h1>
        <ProductForm
          action={updateProductAction.bind(null, product.id)}
          product={{ ...product, price: minorToDecimalString(product.unitPrice, product.currency) }}
          currencies={Intl.supportedValuesOf("currency")}
          defaultCurrency={product.currency}
          submitLabel="Save product"
        />
      </section>
      <form action={deleteProductAction.bind(null, product.id)}>
        <ConfirmButton
          message="Delete this product? Existing quotes keep their copied line items."
          label="Delete product"
          className={dangerButtonClass}
        />
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Add the nav link**

In `src/app/app/layout.tsx`, add `<Link href="/app/catalog">Catalog</Link>` after the Contacts link.

- [ ] **Step 7: Verify lint, types, tests and build**

Run: `npm run lint && npm run typecheck && npm test`, then the build command from Task 6 Step 9.
Expected: all pass; the build lists `/app/catalog` and `/app/catalog/[id]`.

- [ ] **Step 8: Commit**

```bash
git add src/server/catalog tests/server/products.test.ts src/app/app
git commit -m "feat: add the product catalog"
```

---

### Task 8: Template service

**Files:**
- Create: `src/server/content-rules.ts`
- Create: `src/server/templates/templates.ts`
- Test: `tests/server/templates.test.ts`

**Interfaces:**
- Consumes: `templates` (Task 5), `validateContent`, `emptyContent`, `type DocContent` (Task 3), `safeParseQuote`, `type Quote` (Task 2), `computeQuote`, `QuoteError` (Task 2), `DOCUMENT_TYPES`, `PAYMENT_MODES`, `type PaymentMode` (Task 4), `parseInput`, `NotFoundError`, `ValidationError`.
- Produces:
  - `RolesSchema` (Zod: 1–10 unique, non-empty role names ≤ 40 characters)
  - `checkContent(input: unknown, roles: string[]): DocContent` (throws `ValidationError`)
  - `checkQuote(input: unknown): Quote | null` (throws `ValidationError`; `null` means no pricing table)
  - `checkPayment(mode: PaymentMode, percent: number | null): { paymentMode: PaymentMode; paymentPercent: number | null }`
  - `type Template = typeof templates.$inferSelect`
  - `type TemplateSummary = Pick<Template, "id" | "name" | "documentType" | "updatedAt">`
  - `listTemplates(db, ctx): Promise<TemplateSummary[]>`
  - `getTemplate(db, ctx, id: string): Promise<Template>` (throws `NotFoundError("Template not found.")`)
  - `createTemplate(db, ctx, input: unknown): Promise<Template>` (input `{ name, documentType? }`)
  - `updateTemplate(db, ctx, id: string, input: unknown): Promise<Template>` (input: any of `name`, `documentType`, `roles`, `content`, `quote`, `paymentMode`, `paymentPercent`)
  - `duplicateTemplate(db, ctx, id: string): Promise<Template>`
  - `deleteTemplate(db, ctx, id: string): Promise<void>`

- [ ] **Step 1: Write the failing template tests**

Create `tests/server/templates.test.ts`:

```ts
import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { emptyContent } from "@/lib/editor/content";
import { emptyQuote } from "@/lib/quote/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
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
    const saved = await updateTemplate(db, a, template.id, {
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
    await expect(updateTemplate(db, a, template.id, input)).rejects.toThrow(new ValidationError(message));
  });

  it("refuses to remove a role that a field still uses", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    await updateTemplate(db, a, template.id, { content: withField("Client") });
    await expect(updateTemplate(db, a, template.id, { roles: ["Agency"] })).rejects.toThrow(
      new ValidationError('The Signature field uses the role "Client", which is not one of this document\'s roles.'),
    );
  });

  it("clears the deposit percent when payment is not a deposit, and removes a pricing table with null", async () => {
    const template = await createTemplate(db, a, { name: "T" });
    await updateTemplate(db, a, template.id, { quote: pricedQuote(), paymentMode: "deposit_percent", paymentPercent: 40 });
    const saved = await updateTemplate(db, a, template.id, { quote: null, paymentMode: "full", paymentPercent: 40 });
    expect(saved).toMatchObject({ quote: null, paymentMode: "full", paymentPercent: null });
  });

  it("duplicates and deletes templates and lists them by name", async () => {
    const template = await createTemplate(db, a, { name: "Beta" });
    await updateTemplate(db, a, template.id, { content: withField(), quote: pricedQuote() });
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
    await expect(updateTemplate(db, b, template.id, { name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(duplicateTemplate(db, b, template.id)).rejects.toThrow(NotFoundError);
    await expect(deleteTemplate(db, b, template.id)).rejects.toThrow(NotFoundError);
    expect(await listTemplates(db, b)).toEqual([]);
    expect((await getTemplate(db, a, template.id)).name).toBe("Private");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/server/templates.test.ts`
Expected: FAIL with "Failed to resolve import "@/server/templates/templates"".

- [ ] **Step 3: Implement `src/server/content-rules.ts`**

Shared by templates (this task) and documents (Task 11).

```ts
import { z } from "zod";
import type { PaymentMode } from "@/lib/documents";
import { type DocContent, validateContent } from "@/lib/editor/content";
import { type Quote, safeParseQuote } from "@/lib/quote/schema";
import { computeQuote, QuoteError } from "@/lib/quote/totals";
import { ValidationError } from "./errors";

export const RolesSchema = z
  .array(z.string().trim().min(1, "Role names cannot be empty.").max(40, "Role names must be at most 40 characters."))
  .min(1, "Add at least one role.")
  .max(10, "A document can have at most 10 roles.")
  .refine((roles) => new Set(roles.map((role) => role.toLowerCase())).size === roles.length, "Role names must be unique.");

export function checkContent(input: unknown, roles: string[]): DocContent {
  const result = validateContent(input, roles);
  if (!result.ok) throw new ValidationError(result.error);
  return result.content;
}

/** Validates a pricing table and proves its totals compute. null means the document has none. */
export function checkQuote(input: unknown): Quote | null {
  if (input === null) return null;
  const result = safeParseQuote(input);
  if (!result.ok) throw new ValidationError(result.error);
  try {
    computeQuote(result.quote);
  } catch (error) {
    if (error instanceof QuoteError) throw new ValidationError(error.message);
    throw error;
  }
  return result.quote;
}

export function checkPayment(
  mode: PaymentMode,
  percent: number | null,
): { paymentMode: PaymentMode; paymentPercent: number | null } {
  if (mode !== "deposit_percent") return { paymentMode: mode, paymentPercent: null };
  if (percent === null || !Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new ValidationError("Enter a deposit percent between 1 and 100.");
  }
  return { paymentMode: mode, paymentPercent: percent };
}
```

- [ ] **Step 4: Implement `src/server/templates/templates.ts`**

```ts
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { templates } from "@/db/schema";
import type { Db } from "@/db/types";
import { DOCUMENT_TYPES, PAYMENT_MODES } from "@/lib/documents";
import { emptyContent } from "@/lib/editor/content";
import { checkContent, checkPayment, checkQuote, RolesSchema } from "@/server/content-rules";
import { NotFoundError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";

export type Template = typeof templates.$inferSelect;
export type TemplateSummary = Pick<Template, "id" | "name" | "documentType" | "updatedAt">;

const Name = z.string().trim().min(1, "Name is required.").max(200, "Name must be at most 200 characters.");

const CreateInput = z.object({
  name: Name,
  documentType: z.enum(DOCUMENT_TYPES).default("proposal"),
});

const UpdateInput = z
  .object({
    name: Name,
    documentType: z.enum(DOCUMENT_TYPES),
    roles: RolesSchema,
    content: z.unknown(),
    quote: z.unknown(),
    paymentMode: z.enum(PAYMENT_MODES),
    paymentPercent: z.number().nullable(),
  })
  .partial();

function scoped(ctx: OrgContext, id: string) {
  return and(eq(templates.id, id), eq(templates.organizationId, ctx.organizationId));
}

export async function listTemplates(db: Db, ctx: OrgContext): Promise<TemplateSummary[]> {
  return db
    .select({ id: templates.id, name: templates.name, documentType: templates.documentType, updatedAt: templates.updatedAt })
    .from(templates)
    .where(eq(templates.organizationId, ctx.organizationId))
    .orderBy(asc(templates.name));
}

export async function getTemplate(db: Db, ctx: OrgContext, id: string): Promise<Template> {
  const [template] = await db.select().from(templates).where(scoped(ctx, id)).limit(1);
  if (!template) throw new NotFoundError("Template not found.");
  return template;
}

export async function createTemplate(db: Db, ctx: OrgContext, input: unknown): Promise<Template> {
  const data = parseInput(CreateInput, input);
  const [template] = await db
    .insert(templates)
    .values({
      organizationId: ctx.organizationId,
      name: data.name,
      documentType: data.documentType,
      content: emptyContent(data.name),
      createdByUserId: ctx.userId,
    })
    .returning();
  return template;
}

export async function updateTemplate(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<Template> {
  const data = parseInput(UpdateInput, input);
  const existing = await getTemplate(db, ctx, id);
  const roles = data.roles ?? existing.roles;
  // Content is re-checked against the roles even when only the roles change.
  const content = checkContent(data.content !== undefined ? data.content : existing.content, roles);
  const quote = data.quote !== undefined ? checkQuote(data.quote) : existing.quote;
  const payment = checkPayment(
    data.paymentMode ?? existing.paymentMode,
    data.paymentPercent !== undefined ? data.paymentPercent : existing.paymentPercent,
  );
  const [template] = await db
    .update(templates)
    .set({
      name: data.name ?? existing.name,
      documentType: data.documentType ?? existing.documentType,
      roles,
      content,
      quote,
      ...payment,
    })
    .where(scoped(ctx, id))
    .returning();
  if (!template) throw new NotFoundError("Template not found.");
  return template;
}

export async function duplicateTemplate(db: Db, ctx: OrgContext, id: string): Promise<Template> {
  const source = await getTemplate(db, ctx, id);
  const [copy] = await db
    .insert(templates)
    .values({
      organizationId: ctx.organizationId,
      name: `${source.name} (copy)`.slice(0, 200),
      documentType: source.documentType,
      content: source.content,
      roles: source.roles,
      quote: source.quote,
      paymentMode: source.paymentMode,
      paymentPercent: source.paymentPercent,
      createdByUserId: ctx.userId,
    })
    .returning();
  return copy;
}

export async function deleteTemplate(db: Db, ctx: OrgContext, id: string): Promise<void> {
  const deleted = await db.delete(templates).where(scoped(ctx, id)).returning({ id: templates.id });
  if (deleted.length === 0) throw new NotFoundError("Template not found.");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/server/templates.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/content-rules.ts src/server/templates tests/server/templates.test.ts
git commit -m "feat: add the template service"
```

---
### Task 9: Block editor and template pages

**Files:**
- Create: `src/components/editor/rich-editor.tsx`
- Modify: `src/app/globals.css` (editor styles)
- Create: `src/app/app/templates/actions.ts`
- Create: `src/app/app/templates/new-template-form.tsx`
- Create: `src/app/app/templates/page.tsx`
- Create: `src/app/app/templates/[id]/page.tsx`
- Create: `src/app/app/templates/[id]/template-workspace.tsx`
- Create: `src/lib/roles.ts`
- Modify: `src/app/app/layout.tsx` (nav link)
- Test: `tests/lib/roles.test.ts`

**Interfaces:**
- Consumes: `editorExtensions`, `FIELD_KINDS`, `FIELD_LABELS`, `VARIABLE_NAME_PATTERN`, `countQuoteBlocks`, `AUTOMATIC_VARIABLES` (Task 3), `newId` (Task 2), template service (Task 8), app helpers (Task 6), `DOCUMENT_TYPES`, `DOCUMENT_TYPE_LABELS`, `PAYMENT_MODES`, `PAYMENT_MODE_LABELS` (Task 4).
- Produces:
  - `<RichEditor initialContent roles editable? onChange />` (client component; `editable` defaults to `true`)
  - `parseRoleList(text: string): string[]` (comma-separated text to trimmed, non-empty names)
  - Server actions `createTemplateAction(prev, formData)`, `saveTemplateAction(id, input)`, `duplicateTemplateAction(id)`, `deleteTemplateAction(id)`
  - `type TemplateData` and `<TemplateWorkspace template />` (Task 10 extends both)

The toolbar inserts: headings, bold, italic, bullet and numbered lists, a 3×3 table, a page break, the pricing table block (disabled once present), a field (type and role chosen from selects; checkboxes default to optional), and a variable (pick an automatic one or type a custom `Group.Name`). Variables are inserted as plain `[Group.Name]` text.

- [ ] **Step 1: Write the failing role-list test**

Create `tests/lib/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRoleList } from "@/lib/roles";

describe("parseRoleList", () => {
  it("splits on commas, trims and drops empty names", () => {
    expect(parseRoleList(" Client, Agency ,, ")).toEqual(["Client", "Agency"]);
    expect(parseRoleList("")).toEqual([]);
  });
});
```

Run: `npx vitest run tests/lib/roles.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/roles"".

- [ ] **Step 2: Implement `src/lib/roles.ts`**

```ts
/** "Client, Agency" -> ["Client", "Agency"]. Validation (uniqueness, length) happens on the server. */
export function parseRoleList(text: string): string[] {
  return text
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
}
```

Run: `npx vitest run tests/lib/roles.test.ts`
Expected: PASS.

- [ ] **Step 3: Create `src/components/editor/rich-editor.tsx`**

```tsx
"use client";

import { type Editor, EditorContent, type JSONContent, useEditor, useEditorState } from "@tiptap/react";
import { useState } from "react";
import { VARIABLE_NAME_PATTERN } from "@/lib/editor/content";
import { editorExtensions, FIELD_KINDS, FIELD_LABELS, type FieldKind } from "@/lib/editor/extensions";
import { AUTOMATIC_VARIABLES } from "@/lib/editor/variables";
import { newId } from "@/lib/ids";

type RichEditorProps = {
  initialContent: JSONContent;
  roles: string[];
  editable?: boolean;
  onChange: (content: JSONContent) => void;
};

export function RichEditor({ initialContent, roles, editable = true, onChange }: RichEditorProps) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialContent,
    editable,
    // Server rendering has no DOM; the editor mounts on the client.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "pp-editor min-h-[420px] p-6 focus:outline-none", "aria-label": "Document content" },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  });

  if (!editor) return <div className="min-h-[420px] rounded-md border border-neutral-300 bg-white" />;
  return (
    <div className="rounded-md border border-neutral-300 bg-white">
      {editable && <Toolbar editor={editor} roles={roles} />}
      <EditorContent editor={editor} />
    </div>
  );
}

const control = "rounded border border-neutral-300 bg-white px-1 py-1 text-sm";

function ToolbarButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40"
      disabled={disabled}
      // Keeps the editor selection when the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function hasQuoteBlock(editor: Editor): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "quoteBlock") found = true;
    return !found;
  });
  return found;
}

function Toolbar({ editor, roles }: { editor: Editor; roles: string[] }) {
  const { hasQuote } = useEditorState({ editor, selector: ({ editor: current }) => ({ hasQuote: hasQuoteBlock(current) }) });
  const [fieldKind, setFieldKind] = useState<FieldKind>("signature");
  const [fieldRole, setFieldRole] = useState(roles[0] ?? "Client");
  const [customVariable, setCustomVariable] = useState("");
  const role = roles.includes(fieldRole) ? fieldRole : (roles[0] ?? "Client");
  const chain = () => editor.chain().focus();

  function insertVariable(name: string) {
    if (VARIABLE_NAME_PATTERN.test(name)) chain().insertContent(`[${name}]`).run();
  }

  return (
    <div role="toolbar" aria-label="Editor tools" className="flex flex-wrap items-center gap-1 border-b border-neutral-200 p-2">
      <ToolbarButton label="H1" onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton label="H2" onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="Bold" onClick={() => chain().toggleBold().run()} />
      <ToolbarButton label="Italic" onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton label="Bullets" onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton label="Numbers" onClick={() => chain().toggleOrderedList().run()} />
      <ToolbarButton label="Table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <ToolbarButton label="Page break" onClick={() => chain().insertContent({ type: "pageBreak" }).run()} />
      <ToolbarButton
        label="Pricing table"
        disabled={hasQuote}
        onClick={() => chain().insertContent({ type: "quoteBlock" }).run()}
      />

      <span aria-hidden className="mx-2 h-5 w-px bg-neutral-200" />
      <label htmlFor="field-kind" className="sr-only">
        Field type
      </label>
      <select id="field-kind" value={fieldKind} onChange={(event) => setFieldKind(event.target.value as FieldKind)} className={control}>
        {FIELD_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {FIELD_LABELS[kind]}
          </option>
        ))}
      </select>
      <label htmlFor="field-role" className="sr-only">
        Field role
      </label>
      <select id="field-role" value={role} onChange={(event) => setFieldRole(event.target.value)} className={control}>
        {roles.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <ToolbarButton
        label="Insert field"
        disabled={roles.length === 0}
        onClick={() =>
          chain()
            .insertContent({
              type: "field",
              attrs: { id: newId(), kind: fieldKind, role, required: fieldKind !== "checkbox", label: "" },
            })
            .run()
        }
      />

      <span aria-hidden className="mx-2 h-5 w-px bg-neutral-200" />
      <label htmlFor="variable-pick" className="sr-only">
        Insert a variable
      </label>
      <select id="variable-pick" value="" onChange={(event) => insertVariable(event.target.value)} className={control}>
        <option value="">Insert variable…</option>
        {AUTOMATIC_VARIABLES.map((name) => (
          <option key={name} value={name}>
            [{name}]
          </option>
        ))}
      </select>
      <label htmlFor="variable-custom" className="sr-only">
        Custom variable name
      </label>
      <input
        id="variable-custom"
        value={customVariable}
        onChange={(event) => setCustomVariable(event.target.value)}
        placeholder="Deal.Value"
        className={`${control} w-28`}
      />
      <ToolbarButton
        label="Insert"
        disabled={!VARIABLE_NAME_PATTERN.test(customVariable)}
        onClick={() => {
          insertVariable(customVariable);
          setCustomVariable("");
        }}
      />
    </div>
  );
}
```

If `useEditorState` or the `Editor`/`JSONContent` type exports differ in `@tiptap/react` 3.31.3, import them from where that version exports them (check `node_modules/@tiptap/react/dist/index.d.ts`); keep the behavior.

- [ ] **Step 4: Add editor styles**

Append to `src/app/globals.css`:

```css

/* Block editor. Tailwind's reset removes list and heading styles, so they are restored here. */
.pp-editor h1 { font-size: 1.75rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.pp-editor h2 { font-size: 1.375rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.pp-editor h3 { font-size: 1.125rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
.pp-editor p { margin: 0.5rem 0; }
.pp-editor ul { list-style: disc; padding-left: 1.5rem; }
.pp-editor ol { list-style: decimal; padding-left: 1.5rem; }
.pp-editor a { color: #6b2d5c; text-decoration: underline; }
.pp-editor table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
.pp-editor th,
.pp-editor td { border: 1px solid #d4d4d4; padding: 0.375rem 0.5rem; vertical-align: top; }
.pp-editor th { background: #f5f5f5; font-weight: 600; text-align: left; }
.pp-editor .ProseMirror-selectednode { outline: 2px solid #6b2d5c; outline-offset: 2px; }
.pp-page-break { position: relative; margin: 1.5rem 0; border-top: 2px dashed #d4d4d4; }
.pp-page-break::after {
  content: "Page break";
  position: absolute;
  top: -0.7rem;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: #737373;
}
.pp-quote-block {
  margin: 0.75rem 0;
  border: 1px dashed #6b2d5c;
  border-radius: 0.375rem;
  background: #faf5f9;
  padding: 1rem;
  text-align: center;
  color: #6b2d5c;
}
.pp-field {
  display: inline-block;
  border: 1px solid #6b2d5c;
  border-radius: 0.25rem;
  background: #faf5f9;
  padding: 0 0.375rem;
  font-size: 0.875rem;
  color: #6b2d5c;
}
```

- [ ] **Step 5: Add the template actions**

Create `src/app/app/templates/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createTemplate, deleteTemplate, duplicateTemplate, updateTemplate } from "@/server/templates/templates";
import { type ActionState, actionError } from "../action-state";

export async function createTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  let id: string;
  try {
    const template = await createTemplate(db, ctx, {
      name: String(formData.get("name") ?? ""),
      documentType: String(formData.get("documentType") ?? "proposal"),
    });
    id = template.id;
  } catch (error) {
    return actionError("templates", error);
  }
  revalidatePath("/app/templates");
  redirect(`/app/templates/${id}`);
}

/** Saves the whole template; the service validates every field. */
export async function saveTemplateAction(id: string, input: unknown): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateTemplate(db, ctx, id, input);
    revalidatePath("/app/templates");
    revalidatePath(`/app/templates/${id}`);
    return { ok: true, message: "Template saved." };
  } catch (error) {
    return actionError("templates", error);
  }
}

export async function duplicateTemplateAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  const copy = await duplicateTemplate(db, ctx, id);
  revalidatePath("/app/templates");
  redirect(`/app/templates/${copy.id}`);
}

export async function deleteTemplateAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteTemplate(db, ctx, id);
  revalidatePath("/app/templates");
  redirect("/app/templates");
}
```

- [ ] **Step 6: Add the template list page**

Create `src/app/app/templates/new-template-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/lib/documents";
import { buttonClass, FormStatus, inputClass } from "../ui";
import { createTemplateAction } from "./actions";

export function NewTemplateForm() {
  const [state, formAction, pending] = useActionState(createTemplateAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="block min-w-64 flex-1 text-sm">
        Template name
        <input name="name" required className={inputClass} />
      </label>
      <label className="block text-sm">
        Type
        <select name="documentType" defaultValue="proposal" className={inputClass}>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DOCUMENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create template"}
      </button>
      <div className="w-full">
        <FormStatus state={state} />
      </div>
    </form>
  );
}
```

Create `src/app/app/templates/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { requireMember } from "@/server/auth/session";
import { listTemplates } from "@/server/templates/templates";
import { NewTemplateForm } from "./new-template-form";

export default async function TemplatesPage() {
  const { ctx } = await requireMember();
  const templates = await listTemplates(db, ctx);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Templates</h1>
        {templates.length === 0 ? (
          <p className="text-sm text-neutral-600">No templates yet. Create one below.</p>
        ) : (
          <ul className="divide-y rounded-md border border-neutral-200 bg-white">
            {templates.map((template) => (
              <li key={template.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                <Link href={`/app/templates/${template.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                  {template.name}
                </Link>
                <span className="text-neutral-500">
                  {DOCUMENT_TYPE_LABELS[template.documentType]} · updated {template.updatedAt.toLocaleDateString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">New template</h2>
        <NewTemplateForm />
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Add the template workspace and edit page**

Create `src/app/app/templates/[id]/template-workspace.tsx`:

```tsx
"use client";

import type { JSONContent } from "@tiptap/react";
import { useState, useTransition } from "react";
import { RichEditor } from "@/components/editor/rich-editor";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentType,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type PaymentMode,
} from "@/lib/documents";
import type { Quote } from "@/lib/quote/schema";
import { parseRoleList } from "@/lib/roles";
import type { ActionState } from "../../action-state";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { saveTemplateAction } from "../actions";

export type TemplateData = {
  id: string;
  name: string;
  documentType: DocumentType;
  roles: string[];
  content: JSONContent;
  quote: Quote | null;
  paymentMode: PaymentMode;
  paymentPercent: number | null;
};

export function TemplateWorkspace({ template }: { template: TemplateData }) {
  const [name, setName] = useState(template.name);
  const [documentType, setDocumentType] = useState<DocumentType>(template.documentType);
  const [rolesText, setRolesText] = useState(template.roles.join(", "));
  const [content, setContent] = useState<JSONContent>(template.content);
  const [quote] = useState<Quote | null>(template.quote);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(template.paymentMode);
  const [paymentPercent, setPaymentPercent] = useState(template.paymentPercent?.toString() ?? "");
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const roles = parseRoleList(rolesText);

  function save() {
    startTransition(async () => {
      setStatus(
        await saveTemplateAction(template.id, {
          name,
          documentType,
          roles,
          content,
          quote,
          paymentMode,
          paymentPercent: paymentPercent === "" ? null : Number(paymentPercent),
        }),
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm">
          Template name
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          Document type
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)} className={inputClass}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Roles (comma separated; every field belongs to a role)
        <input value={rolesText} onChange={(event) => setRolesText(event.target.value)} className={inputClass} />
      </label>

      <RichEditor initialContent={template.content} roles={roles} onChange={setContent} />

      <fieldset className="grid gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Payment</legend>
        <label className="block text-sm">
          Collect payment
          <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)} className={inputClass}>
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PAYMENT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        {paymentMode === "deposit_percent" && (
          <label className="block text-sm">
            Deposit percent
            <input
              type="number"
              min={1}
              max={100}
              value={paymentPercent}
              onChange={(event) => setPaymentPercent(event.target.value)}
              className={inputClass}
            />
          </label>
        )}
      </fieldset>

      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save template"}
        </button>
        <FormStatus state={status} />
      </div>
    </div>
  );
}
```

Create `src/app/app/templates/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { getTemplate } from "@/server/templates/templates";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass, secondaryButtonClass } from "../../ui";
import { deleteTemplateAction, duplicateTemplateAction } from "../actions";
import { TemplateWorkspace } from "./template-workspace";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const template = await loadOrNotFound(getTemplate(db, ctx, id));

  return (
    <div className="space-y-6">
      <Link href="/app/templates" className="text-sm text-neutral-600 hover:underline">
        ← Templates
      </Link>
      <h1 className="text-2xl font-semibold">{template.name}</h1>
      <TemplateWorkspace
        template={{
          id: template.id,
          name: template.name,
          documentType: template.documentType,
          roles: template.roles,
          content: template.content,
          quote: template.quote,
          paymentMode: template.paymentMode,
          paymentPercent: template.paymentPercent,
        }}
      />
      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <form action={duplicateTemplateAction.bind(null, template.id)}>
          <button type="submit" className={secondaryButtonClass}>
            Duplicate template
          </button>
        </form>
        <form action={deleteTemplateAction.bind(null, template.id)}>
          <ConfirmButton
            message="Delete this template? Documents already created from it are not affected."
            label="Delete template"
            className={dangerButtonClass}
          />
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add the nav link**

In `src/app/app/layout.tsx`, add `<Link href="/app/templates">Templates</Link>` after the Dashboard link, so the order is Dashboard, Templates, Contacts, Catalog, Settings.

- [ ] **Step 9: Verify lint, types, tests and build**

Run: `npm run lint && npm run typecheck && npm test`, then the build command from Task 6 Step 9.
Expected: all pass; the build lists `/app/templates` and `/app/templates/[id]`. A build failure that mentions `window` or `document` means an editor module is imported by a server component; only client components (`"use client"`) may import `@tiptap/react`.

- [ ] **Step 10: Commit**

```bash
git add src/components/editor src/app/globals.css src/app/app src/lib/roles.ts tests/lib/roles.test.ts
git commit -m "feat: add the block editor and template pages"
```

---

### Task 10: Pricing table editor

**Files:**
- Create: `src/components/editor/quote-editor.tsx`
- Modify: `src/app/app/templates/[id]/template-workspace.tsx`
- Modify: `src/app/app/templates/[id]/page.tsx`

**Interfaces:**
- Consumes: `Quote`, `QuoteItem`, `QuoteSection`, `QuoteColumn`, `Adjustment`, `newQuoteItem`, `newQuoteSection`, `emptyQuote` (Task 2), `computeQuote`, `type QuoteTotals` (Task 2), `formatMoney`, `parseMoney`, `minorToDecimalString` (Task 1), `countQuoteBlocks` (Task 3), `listProducts` (Task 7).
- Produces:
  - `type CatalogOption = { id: string; title: string; description: string; unitPrice: number; currency: string; sku: string | null }`
  - `<QuoteEditor quote onChange products currencies editable? />` (client component; `editable` defaults to `true`). Task 13 reuses it on documents.
  - `TemplateWorkspace` gains props `products: CatalogOption[]`, `currencies: string[]`, `defaultCurrency: string`.

Behavior: totals update live in the browser with `computeQuote`; the server recomputes on save. Products are offered only in the quote's currency and are copied into the line (title, description, price, product id). A new line in a multichoice section starts selected only if it is the first. Switching a section to multichoice keeps only its first selected line selected; switching back to standard selects every line. A calculation error is shown in place of the totals.

- [ ] **Step 1: Create `src/components/editor/quote-editor.tsx`**

```tsx
"use client";

import { useState } from "react";
import { formatMoney, minorToDecimalString, parseMoney } from "@/lib/money";
import {
  type Adjustment,
  newQuoteItem,
  newQuoteSection,
  type Quote,
  type QuoteColumn,
  type QuoteItem,
  type QuoteSection,
} from "@/lib/quote/schema";
import { computeQuote, type LineTotal, type QuoteTotals } from "@/lib/quote/totals";

export type CatalogOption = {
  id: string;
  title: string;
  description: string;
  unitPrice: number;
  currency: string;
  sku: string | null;
};

type QuoteEditorProps = {
  quote: Quote;
  onChange: (quote: Quote) => void;
  products: CatalogOption[];
  currencies: string[];
  editable?: boolean;
};

const cell = "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm disabled:bg-neutral-50";
const smallButton = "rounded border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-40";

function calculate(quote: Quote): { totals: QuoteTotals | null; error: string | null } {
  try {
    return { totals: computeQuote(quote), error: null };
  } catch (error) {
    return { totals: null, error: error instanceof Error ? error.message : "The pricing table cannot be calculated." };
  }
}

function MoneyInput({
  value,
  currency,
  label,
  disabled,
  onChange,
}: {
  value: number;
  currency: string;
  label: string;
  disabled?: boolean;
  onChange: (minor: number) => void;
}) {
  const [text, setText] = useState(() => minorToDecimalString(value, currency));
  const valid = parseMoney(text, currency) !== null;
  return (
    <input
      aria-label={label}
      aria-invalid={!valid}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      className={`${cell} text-right ${valid ? "" : "border-red-500"}`}
      onChange={(event) => {
        setText(event.target.value);
        const minor = parseMoney(event.target.value, currency);
        if (minor !== null) onChange(minor);
      }}
    />
  );
}

function NumberInput({
  value,
  label,
  min = 0,
  max,
  disabled,
  onChange,
}: {
  value: number;
  label: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step="any"
      disabled={disabled}
      className={`${cell} text-right`}
      onChange={(event) => {
        const next = event.target.valueAsNumber;
        onChange(Number.isFinite(next) ? next : 0);
      }}
    />
  );
}

function AdjustmentInput({
  value,
  currency,
  label,
  disabled,
  onChange,
}: {
  value: Adjustment | null;
  currency: string;
  label: string;
  disabled?: boolean;
  onChange: (value: Adjustment | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label={`${label} type`}
        value={value?.type ?? "none"}
        disabled={disabled}
        className={`${cell} w-24`}
        onChange={(event) => {
          const type = event.target.value;
          onChange(
            type === "percent" ? { type: "percent", value: 0 } : type === "absolute" ? { type: "absolute", amount: 0 } : null,
          );
        }}
      >
        <option value="none">None</option>
        <option value="percent">%</option>
        <option value="absolute">{currency}</option>
      </select>
      {value?.type === "percent" && (
        <NumberInput
          label={`${label} percent`}
          value={value.value}
          max={100}
          disabled={disabled}
          onChange={(percent) => onChange({ type: "percent", value: Math.min(100, Math.max(0, percent)) })}
        />
      )}
      {value?.type === "absolute" && (
        <MoneyInput
          key={currency}
          label={`${label} amount`}
          value={value.amount}
          currency={currency}
          disabled={disabled}
          onChange={(amount) => onChange({ type: "absolute", amount })}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  section,
  quote,
  line,
  index,
  editable,
  onChange,
  onRemove,
  onMove,
  onChoose,
}: {
  item: QuoteItem;
  section: QuoteSection;
  quote: Quote;
  line: LineTotal | undefined;
  index: number;
  editable: boolean;
  onChange: (patch: Partial<QuoteItem>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onChoose: () => void;
}) {
  const currency = quote.currency;
  const setValue = (columnId: string, value: string | number) => onChange({ values: { ...item.values, [columnId]: value } });
  return (
    <div className={`space-y-2 rounded border p-3 ${line && !line.included ? "border-dashed border-neutral-300 bg-neutral-50" : "border-neutral-200"}`}>
      <div className="grid grid-cols-[1fr_7rem_5rem_7rem_auto] items-center gap-2">
        <input aria-label="Line name" value={item.name} disabled={!editable} onChange={(event) => onChange({ name: event.target.value })} className={cell} />
        <MoneyInput
          key={`${item.id}:${currency}:${item.productId ?? ""}`}
          label="Unit price"
          value={item.price}
          currency={currency}
          disabled={!editable}
          onChange={(price) => onChange({ price })}
        />
        <NumberInput label="Quantity" value={item.qty} disabled={!editable} onChange={(qty) => onChange({ qty })} />
        <span className="text-right text-sm font-medium" aria-label="Line amount">
          {line ? formatMoney(line.net, currency) : "—"}
        </span>
        <span className="flex gap-1">
          <button type="button" aria-label="Move line up" className={smallButton} disabled={!editable || index === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button
            type="button"
            aria-label="Move line down"
            className={smallButton}
            disabled={!editable || index === section.items.length - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button type="button" aria-label="Remove line" className={smallButton} disabled={!editable} onClick={onRemove}>
            ✕
          </button>
        </span>
      </div>
      <input
        aria-label="Line description"
        placeholder="Description (optional)"
        value={item.description}
        disabled={!editable}
        onChange={(event) => onChange({ description: event.target.value })}
        className={cell}
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          Discount
          <AdjustmentInput
            label="Line discount"
            value={item.discount}
            currency={currency}
            disabled={!editable}
            onChange={(discount) => onChange({ discount })}
          />
        </span>
        {section.kind === "multichoice" ? (
          <label className="flex items-center gap-1">
            <input type="radio" name={`choice-${section.id}`} checked={item.selected} disabled={!editable} onChange={onChoose} />
            Chosen option
          </label>
        ) : (
          <>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={item.optional}
                disabled={!editable}
                onChange={(event) => onChange({ optional: event.target.checked, selected: true })}
              />
              Optional
            </label>
            {item.optional && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={item.selected} disabled={!editable} onChange={(event) => onChange({ selected: event.target.checked })} />
                Selected by default
              </label>
            )}
          </>
        )}
        {quote.columns
          .filter((column) => column.formula === null)
          .map((column) => {
            const raw = item.values[column.id];
            return (
              <span key={column.id} className="flex items-center gap-1">
                {column.label}
                {column.type === "text" ? (
                  <input
                    aria-label={column.label}
                    value={typeof raw === "string" ? raw : ""}
                    disabled={!editable}
                    onChange={(event) => setValue(column.id, event.target.value)}
                    className={`${cell} w-32`}
                  />
                ) : column.type === "money" ? (
                  <MoneyInput
                    key={`${item.id}:${column.id}:${currency}`}
                    label={column.label}
                    value={typeof raw === "number" ? raw : 0}
                    currency={currency}
                    disabled={!editable}
                    onChange={(minor) => setValue(column.id, minor)}
                  />
                ) : (
                  <NumberInput
                    label={column.label}
                    value={typeof raw === "number" ? raw : 0}
                    disabled={!editable}
                    onChange={(value) => setValue(column.id, value)}
                  />
                )}
              </span>
            );
          })}
      </div>
    </div>
  );
}

function ColumnsEditor({ quote, editable, onChange }: { quote: Quote; editable: boolean; onChange: (patch: Partial<Quote>) => void }) {
  const updateColumn = (index: number, patch: Partial<QuoteColumn>) =>
    onChange({ columns: quote.columns.map((column, i) => (i === index ? { ...column, ...patch } : column)) });
  return (
    <details className="rounded border border-neutral-200 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Columns and amount formula</summary>
      <p className="mt-2 text-neutral-600">
        A line amount is calculated from <code>price</code>, <code>qty</code> and your number columns with + − × ÷ and
        parentheses. Money values are in minor units (cents), and percent columns hold whole numbers (10 means 10%).
      </p>
      <label className="mt-3 block">
        Amount formula
        <input
          value={quote.amountFormula}
          disabled={!editable}
          onChange={(event) => onChange({ amountFormula: event.target.value })}
          className={cell}
        />
      </label>
      {quote.columns.map((column, index) => (
        <div key={index} className="mt-2 grid grid-cols-[1fr_1fr_7rem_1fr_auto] items-center gap-2">
          <input
            aria-label="Column id"
            value={column.id}
            disabled={!editable}
            onChange={(event) => updateColumn(index, { id: event.target.value.toLowerCase() })}
            className={cell}
          />
          <input
            aria-label="Column label"
            value={column.label}
            disabled={!editable}
            onChange={(event) => updateColumn(index, { label: event.target.value })}
            className={cell}
          />
          <select
            aria-label="Column type"
            value={column.type}
            disabled={!editable}
            onChange={(event) => {
              const type = event.target.value as QuoteColumn["type"];
              updateColumn(index, { type, formula: type === "text" ? null : column.formula });
            }}
            className={cell}
          >
            <option value="number">Number</option>
            <option value="money">Money</option>
            <option value="percent">Percent</option>
            <option value="text">Text</option>
          </select>
          <input
            aria-label="Column formula"
            placeholder="No formula"
            value={column.formula ?? ""}
            disabled={!editable || column.type === "text"}
            onChange={(event) => updateColumn(index, { formula: event.target.value.trim() === "" ? null : event.target.value })}
            className={cell}
          />
          <button
            type="button"
            className={smallButton}
            disabled={!editable}
            onClick={() => onChange({ columns: quote.columns.filter((_, i) => i !== index) })}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`${smallButton} mt-3`}
        disabled={!editable}
        onClick={() =>
          onChange({
            columns: [
              ...quote.columns,
              { id: `col_${quote.columns.length + 1}`, label: `Column ${quote.columns.length + 1}`, type: "number", formula: null },
            ],
          })
        }
      >
        Add column
      </button>
    </details>
  );
}

export function QuoteEditor({ quote, onChange, products, currencies, editable = true }: QuoteEditorProps) {
  const { totals, error } = calculate(quote);
  const lines = new Map(totals?.lines.map((line) => [line.itemId, line]) ?? []);
  const catalog = products.filter((product) => product.currency === quote.currency);
  const update = (patch: Partial<Quote>) => onChange({ ...quote, ...patch });

  function updateSection(sectionId: string, change: (section: QuoteSection) => QuoteSection) {
    update({ sections: quote.sections.map((section) => (section.id === sectionId ? change(section) : section)) });
  }
  function updateItem(sectionId: string, itemId: string, patch: Partial<QuoteItem>) {
    updateSection(sectionId, (section) => ({
      ...section,
      items: section.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  }
  function addItem(section: QuoteSection, product?: CatalogOption) {
    const item = newQuoteItem(
      product ? { productId: product.id, name: product.title, description: product.description, price: product.unitPrice } : {},
    );
    if (section.kind === "multichoice") item.selected = section.items.length === 0;
    updateSection(section.id, (current) => ({ ...current, items: [...current.items, item] }));
  }
  function moveItem(section: QuoteSection, index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= section.items.length) return;
    const items = [...section.items];
    [items[index], items[target]] = [items[target], items[index]];
    updateSection(section.id, (current) => ({ ...current, items }));
  }
  function setKind(section: QuoteSection, kind: QuoteSection["kind"]) {
    const firstSelected = section.items.findIndex((item) => item.selected);
    updateSection(section.id, (current) => ({
      ...current,
      kind,
      items: current.items.map((item, index) => ({ ...item, selected: kind === "multichoice" ? index === firstSelected : true })),
    }));
  }

  return (
    <div className="space-y-4 rounded-md border border-neutral-300 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="mr-auto text-base font-semibold">Pricing table</h3>
        <label className="text-sm">
          Currency
          <select value={quote.currency} disabled={!editable} onChange={(event) => update({ currency: event.target.value })} className={cell}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      {quote.sections.map((section, sectionIndex) => (
        <section key={section.id} aria-label={section.title || `Section ${sectionIndex + 1}`} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Section title"
              placeholder="Section title (optional)"
              value={section.title}
              disabled={!editable}
              onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))}
              className={`${cell} max-w-sm`}
            />
            <select
              aria-label="Section kind"
              value={section.kind}
              disabled={!editable}
              onChange={(event) => setKind(section, event.target.value as QuoteSection["kind"])}
              className={`${cell} w-48`}
            >
              <option value="standard">Standard lines</option>
              <option value="multichoice">Choose one option</option>
            </select>
            <button
              type="button"
              className={smallButton}
              disabled={!editable}
              onClick={() => update({ sections: quote.sections.filter((s) => s.id !== section.id) })}
            >
              Remove section
            </button>
          </div>

          {section.items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              section={section}
              quote={quote}
              line={lines.get(item.id)}
              index={index}
              editable={editable}
              onChange={(patch) => updateItem(section.id, item.id, patch)}
              onRemove={() =>
                updateSection(section.id, (current) => ({ ...current, items: current.items.filter((i) => i.id !== item.id) }))
              }
              onMove={(delta) => moveItem(section, index, delta)}
              onChoose={() =>
                updateSection(section.id, (current) => ({
                  ...current,
                  items: current.items.map((i) => ({ ...i, selected: i.id === item.id })),
                }))
              }
            />
          ))}

          {editable && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={() => addItem(section)}>
                Add line
              </button>
              <label className="sr-only" htmlFor={`catalog-${section.id}`}>
                Add from catalog
              </label>
              <select
                id={`catalog-${section.id}`}
                value=""
                className={`${cell} w-64`}
                onChange={(event) => {
                  const product = catalog.find((p) => p.id === event.target.value);
                  if (product) addItem(section, product);
                }}
              >
                <option value="">{catalog.length ? "Add from catalog…" : `No catalog products in ${quote.currency}`}</option>
                {catalog.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title} — {formatMoney(product.unitPrice, product.currency)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
      ))}

      {editable && (
        <button type="button" className={smallButton} onClick={() => update({ sections: [...quote.sections, newQuoteSection()] })}>
          Add section
        </button>
      )}

      <ColumnsEditor quote={quote} editable={editable} onChange={update} />

      <div className="flex flex-wrap items-start justify-between gap-6 border-t border-neutral-200 pt-4 text-sm">
        <div className="space-y-2">
          <span className="flex items-center gap-2">
            Discount
            <AdjustmentInput
              label="Quote discount"
              value={quote.discount}
              currency={quote.currency}
              disabled={!editable}
              onChange={(discount) => update({ discount })}
            />
          </span>
          <span className="flex items-center gap-2">
            Tax
            <AdjustmentInput label="Tax" value={quote.tax} currency={quote.currency} disabled={!editable} onChange={(tax) => update({ tax })} />
          </span>
        </div>
        {error ? (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        ) : (
          totals && (
            <dl className="grid w-64 grid-cols-2 gap-1">
              <dt>Subtotal</dt>
              <dd className="text-right">{formatMoney(totals.subtotal, quote.currency)}</dd>
              {totals.discount > 0 && (
                <>
                  <dt>Discount</dt>
                  <dd className="text-right">−{formatMoney(totals.discount, quote.currency)}</dd>
                </>
              )}
              {totals.tax > 0 && (
                <>
                  <dt>Tax</dt>
                  <dd className="text-right">{formatMoney(totals.tax, quote.currency)}</dd>
                </>
              )}
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{formatMoney(totals.total, quote.currency)}</dd>
            </dl>
          )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the pricing table into the template workspace**

In `src/app/app/templates/[id]/template-workspace.tsx`:

1. Add imports:

```tsx
import { type CatalogOption, QuoteEditor } from "@/components/editor/quote-editor";
import { countQuoteBlocks } from "@/lib/editor/content";
import { emptyQuote } from "@/lib/quote/schema";
import { secondaryButtonClass } from "../../ui";
```

(merge `secondaryButtonClass` into the existing `../../ui` import).

2. Change the component signature and the quote state:

```tsx
export function TemplateWorkspace({
  template,
  products,
  currencies,
  defaultCurrency,
}: {
  template: TemplateData;
  products: CatalogOption[];
  currencies: string[];
  defaultCurrency: string;
}) {
```

```tsx
  const [quote, setQuote] = useState<Quote | null>(template.quote);
```

3. Insert this block between the `<RichEditor … />` line and the payment `<fieldset>`:

```tsx
      {quote ? (
        <div className="space-y-2">
          {countQuoteBlocks(content) === 0 && (
            <p className="text-sm text-amber-700">Insert the “Pricing table” block in the content where the table should appear.</p>
          )}
          <QuoteEditor quote={quote} onChange={setQuote} products={products} currencies={currencies} />
          <button type="button" className={secondaryButtonClass} onClick={() => setQuote(null)}>
            Remove pricing table
          </button>
        </div>
      ) : (
        <button type="button" className={secondaryButtonClass} onClick={() => setQuote(emptyQuote(defaultCurrency))}>
          Add pricing table
        </button>
      )}
```

- [ ] **Step 3: Pass products and currencies from the template page**

In `src/app/app/templates/[id]/page.tsx`, add imports:

```tsx
import { listProducts } from "@/server/catalog/products";
import { getOrganizationSettings } from "@/server/org/settings";
```

load them after the template:

```tsx
  const [products, org] = await Promise.all([listProducts(db, ctx), getOrganizationSettings(db, ctx)]);
```

and pass them to the workspace:

```tsx
        products={products.map(({ id, title, description, unitPrice, currency, sku }) => ({
          id,
          title,
          description,
          unitPrice,
          currency,
          sku,
        }))}
        currencies={Intl.supportedValuesOf("currency")}
        defaultCurrency={org.defaultCurrency}
```

- [ ] **Step 4: Verify lint, types, tests and build**

Run: `npm run lint && npm run typecheck && npm test`, then the build command from Task 6 Step 9.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/quote-editor.tsx src/app/app/templates
git commit -m "feat: add the pricing table editor with live totals"
```

---
### Task 11: Document service and numbering

**Files:**
- Create: `src/server/documents/numbering.ts`
- Create: `src/server/documents/documents.ts`
- Test: `tests/server/documents.test.ts`

**Interfaces:**
- Consumes: `documents`, `recipients`, `numberingSequences`, `contacts`, `user` (Task 5); `getTemplate` (Task 8); `getContact` (Task 6); `checkContent`, `checkQuote`, `checkPayment`, `RolesSchema` (Task 8); `emptyContent`, `VARIABLE_NAME_PATTERN` (Task 3); `variableValues` (Task 3); `emptyQuote` (Task 2); `computeQuote` (Task 2); `DEFAULT_NUMBER_PREFIXES`, `formatDocumentNumber`, `DOCUMENT_TYPES`, `DOCUMENT_TYPE_LABELS`, `PAYMENT_MODES` (Task 4); `getOrganizationSettings` (Plan 1).
- Produces:
  - `allocateDocumentNumber(db: Db, ctx: OrgContext, type: DocumentType): Promise<string>`
  - `type DocumentRow`, `type Recipient`, `type DocumentDetail = DocumentRow & { recipients: Recipient[] }`
  - `type DocumentSummary` (id, name, number, type, status, total, currency, updatedAt, contactName)
  - `createDocument(db, ctx, input: unknown): Promise<DocumentRow>` (input `{ type?, name?, templateId?, contactId? }`)
  - `listDocuments(db, ctx, filters?: { status?: DocumentStatus; type?: DocumentType }): Promise<DocumentSummary[]>`
  - `getDocument(db, ctx, id): Promise<DocumentDetail>` (throws `NotFoundError("Document not found.")`)
  - `getDraftDocument(db, ctx, id): Promise<DocumentDetail>` (throws `ValidationError("Only draft documents can be edited.")` for other statuses)
  - `updateDocument(db, ctx, id, input: unknown): Promise<DocumentRow>` (input: any of `name`, `contactId`, `roles`, `content`, `quote`, `variables`, `paymentMode`, `paymentPercent`)
  - `deleteDocument(db, ctx, id): Promise<void>` (drafts only)
  - `documentVariableValues(db, ctx, document: DocumentRow): Promise<Record<string, string>>`

Rules:
- Creating from a template copies its content, roles, pricing table and payment settings. Type and name default to the template's; without a template the type defaults to `proposal` and the name to "New <type>".
- Quote and invoice documents without a template pricing table start with `emptyQuote(organization default currency)`; proposals and contracts start without one.
- When a contact is given it becomes the document's client (`contactId`, the source of `[Client.*]` variables) and its first signer, with the first role.
- Numbers come from `numbering_sequences` with one atomic upsert per document, per organization and type (`P-0001`, `Q-0001`, `C-0001`, `INV-0001`). Lookups of the template and contact happen before the number is taken, so a refused request does not use a number.
- `total` and `currency` are always recomputed from the stored pricing table; input fields named `total` or `currency` are ignored.
- Only `draft` documents can be updated or deleted in this plan.

- [ ] **Step 1: Write the failing document tests**

Create `tests/server/documents.test.ts`:

```ts
import type { JSONContent } from "@tiptap/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/db/schema";
import type { Db } from "@/db/types";
import { emptyContent } from "@/lib/editor/content";
import { emptyQuote } from "@/lib/quote/schema";
import { createContact } from "@/server/contacts/contacts";
import {
  createDocument,
  deleteDocument,
  documentVariableValues,
  getDocument,
  listDocuments,
  updateDocument,
} from "@/server/documents/documents";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createTemplate, updateTemplate } from "@/server/templates/templates";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, seedTwoOrganizations } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let a: OrgContext;
let aMember: OrgContext;
let b: OrgContext;
let templateId: string;
let contactId: string;

const content: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Dear [Client.Name]," }] },
    { type: "quoteBlock" },
    { type: "paragraph", content: [{ type: "field", attrs: { id: "f1", kind: "signature", role: "Client", required: true, label: "" } }] },
  ],
};
const pricedQuote = (qty = 1, currency = "USD") => ({
  ...emptyQuote(currency),
  sections: [{ id: "s1", title: "", kind: "standard", items: [{ id: "i1", name: "Design", price: 100000, qty }] }],
});

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, aMember, b } = await seedTwoOrganizations(db));
  const template = await createTemplate(db, a, { name: "Website proposal" });
  await updateTemplate(db, a, template.id, {
    roles: ["Client", "Agency"],
    content,
    quote: pricedQuote(),
    paymentMode: "deposit_percent",
    paymentPercent: 30,
  });
  templateId = template.id;
  contactId = (await createContact(db, a, { name: "Jane Doe", email: "jane@acme.com" })).id;
});
afterEach(async () => {
  await close();
});

describe("createDocument", () => {
  it("creates a draft from a template for a contact", async () => {
    const created = await createDocument(db, aMember, { templateId, contactId });
    const document = await getDocument(db, a, created.id);
    expect(document).toMatchObject({
      organizationId: a.organizationId,
      type: "proposal",
      name: "Website proposal",
      number: "P-0001",
      status: "draft",
      templateId,
      contactId,
      createdByUserId: aMember.userId,
      roles: ["Client", "Agency"],
      content,
      currency: "USD",
      total: 100000,
      paymentMode: "deposit_percent",
      paymentPercent: 30,
    });
    expect(document.quote?.sections[0].items[0].price).toBe(100000);
    expect(document.recipients).toMatchObject([
      { contactId, name: "Jane Doe", email: "jane@acme.com", role: "Client", kind: "signer", ordering: 1 },
    ]);
  });

  it("starts a blank invoice with an empty pricing table in the organization currency", async () => {
    const created = await createDocument(db, a, { type: "invoice" });
    const document = await getDocument(db, a, created.id);
    expect(document).toMatchObject({ name: "New invoice", number: "INV-0001", total: 0, currency: "USD", recipients: [] });
    expect(document.quote?.currency).toBe("USD");
    expect(document.content).toEqual(emptyContent("New invoice"));
  });

  it("starts a blank proposal without a pricing table", async () => {
    const created = await createDocument(db, a, { type: "proposal", name: "Custom name" });
    expect(created).toMatchObject({ name: "Custom name", quote: null, total: 0 });
  });

  it("numbers each type and organization separately and in sequence", async () => {
    const numbers = [];
    for (const type of ["proposal", "proposal", "quote", "invoice"]) numbers.push((await createDocument(db, a, { type })).number);
    expect(numbers).toEqual(["P-0001", "P-0002", "Q-0001", "INV-0001"]);
    expect((await createDocument(db, b, { type: "proposal" })).number).toBe("P-0001");
  });

  it("gives documents created at the same time distinct numbers", async () => {
    const created = await Promise.all(Array.from({ length: 5 }, () => createDocument(db, a, { type: "contract" })));
    expect(created.map((d) => d.number).sort()).toEqual(["C-0001", "C-0002", "C-0003", "C-0004", "C-0005"]);
  });

  it("refuses another organization's template or contact without using a number", async () => {
    await expect(createDocument(db, b, { templateId })).rejects.toThrow(new NotFoundError("Template not found."));
    await expect(createDocument(db, b, { contactId })).rejects.toThrow(new NotFoundError("Contact not found."));
    expect((await createDocument(db, b, {})).number).toBe("P-0001");
  });

  it("treats blank form ids as none", async () => {
    const created = await createDocument(db, a, { type: "contract", templateId: "", contactId: "" });
    expect(created).toMatchObject({ templateId: null, contactId: null, name: "New contract" });
  });
});

describe("updateDocument", () => {
  it("recomputes the total and currency from the pricing table and ignores client-sent totals", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    const updated = await updateDocument(db, a, id, { quote: pricedQuote(3, "EUR"), total: 1, currency: "JPY" });
    expect(updated).toMatchObject({ total: 300000, currency: "EUR" });
    const cleared = await updateDocument(db, a, id, { quote: null });
    expect(cleared).toMatchObject({ total: 0, currency: "EUR", quote: null });
  });

  it("stores trimmed custom variables and combines them with automatic values", async () => {
    const { id } = await createDocument(db, aMember, { templateId, contactId });
    const updated = await updateDocument(db, a, id, { variables: { "Deal.Value": " Gold ", "Deal.Empty": " " } });
    expect(updated.variables).toEqual({ "Deal.Value": "Gold" });
    const values = await documentVariableValues(db, a, updated);
    expect(values).toMatchObject({
      "Client.Name": "Jane Doe",
      "Sender.Name": "Amy",
      "Organization.Name": "Org A",
      "Document.Number": "P-0001",
      "Document.Total": "$1,000.00",
      "Deal.Value": "Gold",
    });
  });

  it.each([
    [{ variables: { deal: "x" } }, "Variable names look like Group.Name."],
    [{ name: "" }, "Name is required."],
    [{ content: { type: "doc", content: [{ type: "script" }] } }, "Document content is not valid."],
    [{ paymentMode: "deposit_percent", paymentPercent: null }, "Enter a deposit percent between 1 and 100."],
  ])("rejects invalid updates %#", async (input, message) => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(updateDocument(db, a, id, input)).rejects.toThrow(new ValidationError(message));
  });

  it("refuses to remove a role that a recipient holds", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(updateDocument(db, a, id, { roles: ["Agency"] })).rejects.toThrow(
      new ValidationError('Remove the recipient Jane Doe or give them another role before removing the role "Client".'),
    );
  });

  it("changes the client contact only to one in the same organization", async () => {
    const { id } = await createDocument(db, a, { templateId });
    expect((await updateDocument(db, a, id, { contactId })).contactId).toBe(contactId);
    const other = await createContact(db, b, { name: "Bob", email: "bob@globex.com" });
    await expect(updateDocument(db, a, id, { contactId: other.id })).rejects.toThrow(NotFoundError);
    expect((await updateDocument(db, a, id, { contactId: null })).contactId).toBeNull();
  });

  it("edits and deletes drafts only", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, id));
    await expect(updateDocument(db, a, id, { name: "Changed" })).rejects.toThrow(
      new ValidationError("Only draft documents can be edited."),
    );
    await expect(deleteDocument(db, a, id)).rejects.toThrow(new ValidationError("Only draft documents can be edited."));
  });

  it("deletes a draft with its recipients", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await deleteDocument(db, a, id);
    await expect(getDocument(db, a, id)).rejects.toThrow(NotFoundError);
  });
});

describe("listing and isolation", () => {
  it("lists documents with the client name, filtered by status and type", async () => {
    await createDocument(db, a, { templateId, contactId });
    const invoice = await createDocument(db, a, { type: "invoice" });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, invoice.id));
    expect((await listDocuments(db, a)).map((d) => [d.number, d.contactName])).toEqual(
      expect.arrayContaining([
        ["P-0001", "Jane Doe"],
        ["INV-0001", null],
      ]),
    );
    expect((await listDocuments(db, a, { status: "sent" })).map((d) => d.number)).toEqual(["INV-0001"]);
    expect((await listDocuments(db, a, { type: "proposal" })).map((d) => d.number)).toEqual(["P-0001"]);
  });

  it("hides one organization's documents from another", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(getDocument(db, b, id)).rejects.toThrow(new NotFoundError("Document not found."));
    await expect(updateDocument(db, b, id, { name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(deleteDocument(db, b, id)).rejects.toThrow(NotFoundError);
    expect(await listDocuments(db, b)).toEqual([]);
    expect((await getDocument(db, a, id)).name).toBe("Website proposal");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/server/documents.test.ts`
Expected: FAIL with "Failed to resolve import "@/server/documents/documents"".

- [ ] **Step 3: Implement `src/server/documents/numbering.ts`**

```ts
import { sql } from "drizzle-orm";
import { numberingSequences } from "@/db/schema";
import type { Db } from "@/db/types";
import { DEFAULT_NUMBER_PREFIXES, type DocumentType, formatDocumentNumber } from "@/lib/documents";
import type { OrgContext } from "@/server/tenancy";

/**
 * Takes the next number for a document type in one atomic statement: the first
 * call creates the sequence at 2 and returns 1; later calls increment it.
 */
export async function allocateDocumentNumber(db: Db, ctx: OrgContext, type: DocumentType): Promise<string> {
  const [row] = await db
    .insert(numberingSequences)
    .values({
      organizationId: ctx.organizationId,
      documentType: type,
      prefix: DEFAULT_NUMBER_PREFIXES[type],
      nextValue: 2,
    })
    .onConflictDoUpdate({
      target: [numberingSequences.organizationId, numberingSequences.documentType],
      set: { nextValue: sql`${numberingSequences.nextValue} + 1` },
    })
    .returning({ prefix: numberingSequences.prefix, nextValue: numberingSequences.nextValue });
  return formatDocumentNumber(row.prefix, row.nextValue - 1);
}
```

- [ ] **Step 4: Implement `src/server/documents/documents.ts`**

```ts
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { contacts, documents, recipients, user } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
  PAYMENT_MODES,
} from "@/lib/documents";
import { emptyContent, VARIABLE_NAME_PATTERN } from "@/lib/editor/content";
import { variableValues } from "@/lib/editor/variables";
import { emptyQuote, type Quote } from "@/lib/quote/schema";
import { computeQuote } from "@/lib/quote/totals";
import { getContact } from "@/server/contacts/contacts";
import { checkContent, checkPayment, checkQuote, RolesSchema } from "@/server/content-rules";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getOrganizationSettings } from "@/server/org/settings";
import { getTemplate } from "@/server/templates/templates";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";
import { allocateDocumentNumber } from "./numbering";

export type DocumentRow = typeof documents.$inferSelect;
export type Recipient = typeof recipients.$inferSelect;
export type DocumentDetail = DocumentRow & { recipients: Recipient[] };
export type DocumentSummary = Pick<
  DocumentRow,
  "id" | "name" | "number" | "type" | "status" | "total" | "currency" | "updatedAt"
> & { contactName: string | null };

// Types that always carry a pricing table.
const PRICED_TYPES: readonly DocumentType[] = ["quote", "invoice"];

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);
const optionalId = z.preprocess(blankToNull, z.string().min(1).nullable().default(null));

const CreateInput = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  name: z.string().trim().max(200, "Name must be at most 200 characters.").optional(),
  templateId: optionalId,
  contactId: optionalId,
});

// Keys are checked in superRefine because record-key failures do not carry custom messages.
const Variables = z
  .record(z.string(), z.string().max(1000, "Variable values must be at most 1000 characters."))
  .superRefine((values, ctx) => {
    const names = Object.keys(values);
    if (names.some((name) => !VARIABLE_NAME_PATTERN.test(name))) {
      ctx.addIssue({ code: "custom", message: "Variable names look like Group.Name." });
    } else if (names.length > 100) {
      ctx.addIssue({ code: "custom", message: "A document can have at most 100 custom variables." });
    }
  });

const UpdateInput = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(200, "Name must be at most 200 characters."),
    contactId: z.preprocess(blankToNull, z.string().min(1).nullable()),
    roles: RolesSchema,
    content: z.unknown(),
    quote: z.unknown(),
    variables: Variables,
    paymentMode: z.enum(PAYMENT_MODES),
    paymentPercent: z.number().nullable(),
  })
  .partial();

function scoped(ctx: OrgContext, id: string) {
  return and(eq(documents.id, id), eq(documents.organizationId, ctx.organizationId));
}

export async function createDocument(db: Db, ctx: OrgContext, input: unknown): Promise<DocumentRow> {
  const data = parseInput(CreateInput, input);
  // Tenant-scoped lookups first, so a refused request does not take a number.
  const template = data.templateId ? await getTemplate(db, ctx, data.templateId) : null;
  const contact = data.contactId ? await getContact(db, ctx, data.contactId) : null;
  const org = await getOrganizationSettings(db, ctx);

  const type = data.type ?? template?.documentType ?? "proposal";
  const name = data.name || template?.name || `New ${DOCUMENT_TYPE_LABELS[type].toLowerCase()}`;
  const roles = template?.roles ?? ["Client"];
  const quote: Quote | null = template?.quote ?? (PRICED_TYPES.includes(type) ? emptyQuote(org.defaultCurrency) : null);

  return db.transaction(async (tx) => {
    const number = await allocateDocumentNumber(tx, ctx, type);
    const [document] = await tx
      .insert(documents)
      .values({
        organizationId: ctx.organizationId,
        type,
        name,
        number,
        templateId: template?.id ?? null,
        contactId: contact?.id ?? null,
        createdByUserId: ctx.userId,
        content: template?.content ?? emptyContent(name),
        quote,
        roles,
        currency: quote?.currency ?? org.defaultCurrency,
        total: quote ? computeQuote(quote).total : 0,
        paymentMode: template?.paymentMode ?? "off",
        paymentPercent: template?.paymentPercent ?? null,
      })
      .returning();
    if (contact) {
      await tx.insert(recipients).values({
        organizationId: ctx.organizationId,
        documentId: document.id,
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        role: roles[0],
        kind: "signer",
        ordering: 1,
      });
    }
    return document;
  });
}

export async function listDocuments(
  db: Db,
  ctx: OrgContext,
  filters: { status?: DocumentStatus; type?: DocumentType } = {},
): Promise<DocumentSummary[]> {
  const conditions = [eq(documents.organizationId, ctx.organizationId)];
  if (filters.status) conditions.push(eq(documents.status, filters.status));
  if (filters.type) conditions.push(eq(documents.type, filters.type));
  return db
    .select({
      id: documents.id,
      name: documents.name,
      number: documents.number,
      type: documents.type,
      status: documents.status,
      total: documents.total,
      currency: documents.currency,
      updatedAt: documents.updatedAt,
      contactName: contacts.name,
    })
    .from(documents)
    .leftJoin(contacts, eq(contacts.id, documents.contactId))
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(200);
}

export async function getDocument(db: Db, ctx: OrgContext, id: string): Promise<DocumentDetail> {
  const [document] = await db.select().from(documents).where(scoped(ctx, id)).limit(1);
  if (!document) throw new NotFoundError("Document not found.");
  const rows = await db
    .select()
    .from(recipients)
    .where(and(eq(recipients.documentId, id), eq(recipients.organizationId, ctx.organizationId)))
    .orderBy(asc(recipients.ordering), asc(recipients.createdAt));
  return { ...document, recipients: rows };
}

export async function getDraftDocument(db: Db, ctx: OrgContext, id: string): Promise<DocumentDetail> {
  const document = await getDocument(db, ctx, id);
  if (document.status !== "draft") throw new ValidationError("Only draft documents can be edited.");
  return document;
}

export async function updateDocument(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<DocumentRow> {
  const data = parseInput(UpdateInput, input);
  const existing = await getDraftDocument(db, ctx, id);

  const roles = data.roles ?? existing.roles;
  const orphan = existing.recipients.find((recipient) => recipient.role !== null && !roles.includes(recipient.role));
  if (orphan) {
    throw new ValidationError(
      `Remove the recipient ${orphan.name} or give them another role before removing the role "${orphan.role}".`,
    );
  }
  const content = checkContent(data.content !== undefined ? data.content : existing.content, roles);
  const quote = data.quote !== undefined ? checkQuote(data.quote) : existing.quote;
  const payment = checkPayment(
    data.paymentMode ?? existing.paymentMode,
    data.paymentPercent !== undefined ? data.paymentPercent : existing.paymentPercent,
  );
  let contactId = existing.contactId;
  if (data.contactId !== undefined) {
    contactId = data.contactId === null ? null : (await getContact(db, ctx, data.contactId)).id;
  }
  const variables = data.variables
    ? Object.fromEntries(
        Object.entries(data.variables)
          .map(([name, value]) => [name, value.trim()] as const)
          .filter(([, value]) => value !== ""),
      )
    : existing.variables;

  const [document] = await db
    .update(documents)
    .set({
      name: data.name ?? existing.name,
      contactId,
      roles,
      content,
      quote,
      variables,
      ...payment,
      // Always derived from the stored pricing table, never from input.
      currency: quote?.currency ?? existing.currency,
      total: quote ? computeQuote(quote).total : 0,
    })
    .where(and(scoped(ctx, id), eq(documents.status, "draft")))
    .returning();
  if (!document) throw new ValidationError("Only draft documents can be edited.");
  return document;
}

export async function deleteDocument(db: Db, ctx: OrgContext, id: string): Promise<void> {
  await getDraftDocument(db, ctx, id);
  await db.delete(documents).where(and(scoped(ctx, id), eq(documents.status, "draft")));
}

export async function documentVariableValues(db: Db, ctx: OrgContext, document: DocumentRow): Promise<Record<string, string>> {
  const [contact] = document.contactId
    ? await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, document.contactId), eq(contacts.organizationId, ctx.organizationId)))
        .limit(1)
    : [];
  const [sender] = document.createdByUserId
    ? await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, document.createdByUserId)).limit(1)
    : [];
  const org = await getOrganizationSettings(db, ctx);
  return variableValues(
    {
      contact: contact ?? null,
      sender: sender ?? null,
      organizationName: org.name,
      document: { name: document.name, number: document.number, total: document.total, currency: document.currency },
    },
    document.variables,
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/server/documents.test.ts`
Expected: PASS. If the concurrent-numbering test fails because PGlite rejects parallel transactions on one connection, report it as DONE_WITH_CONCERNS with the error instead of serializing the test; the upsert itself must stay a single statement.

- [ ] **Step 6: Commit**

```bash
git add src/server/documents/numbering.ts src/server/documents/documents.ts tests/server/documents.test.ts
git commit -m "feat: add the document service with atomic numbering"
```

---

### Task 12: Recipients and send readiness

**Files:**
- Create: `src/server/documents/recipients.ts`
- Create: `src/server/documents/readiness.ts`
- Test: `tests/server/recipients.test.ts`
- Test: `tests/server/readiness.test.ts`

**Interfaces:**
- Consumes: `getDraftDocument`, `type DocumentDetail`, `type Recipient`, `documentVariableValues` (Task 11); `getContact` (Task 6); `extractFields`, `extractVariables`, `countQuoteBlocks` (Task 3); `computeQuote`, `QuoteError` (Task 2); `isUniqueViolation`, `parseInput` (Task 5).
- Produces:
  - `addRecipient(db, ctx, documentId: string, input: unknown): Promise<Recipient>` (input `{ contactId, kind?: "signer" | "cc", role? }`)
  - `removeRecipient(db, ctx, documentId: string, recipientId: string): Promise<void>`
  - `moveRecipient(db, ctx, documentId: string, recipientId: string, direction: "up" | "down"): Promise<void>`
  - `type ReadinessInput`, `checkSendReadiness(input: ReadinessInput): string[]` (empty array means ready)
  - `documentReadiness(db, ctx, document: DocumentDetail): Promise<string[]>`

Plan 3 calls `checkSendReadiness` before sending and refuses to send while it returns problems. Signers need one of the document's roles; copies (`cc`) have no role. Recipient order is the signing order Plan 3 uses.

- [ ] **Step 1: Write the failing readiness tests**

Create `tests/server/readiness.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing recipient tests**

Create `tests/server/recipients.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/db/schema";
import type { Db } from "@/db/types";
import { createContact } from "@/server/contacts/contacts";
import { createDocument, getDocument, updateDocument } from "@/server/documents/documents";
import { documentReadiness } from "@/server/documents/readiness";
import { addRecipient, moveRecipient, removeRecipient } from "@/server/documents/recipients";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, seedTwoOrganizations } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let a: OrgContext;
let b: OrgContext;
let documentId: string;
let jane: string;
let sam: string;
let pat: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, b } = await seedTwoOrganizations(db));
  jane = (await createContact(db, a, { name: "Jane", email: "jane@acme.com" })).id;
  sam = (await createContact(db, a, { name: "Sam", email: "sam@studio.com" })).id;
  pat = (await createContact(db, a, { name: "Pat", email: "pat@acme.com" })).id;
  documentId = (await createDocument(db, a, { type: "contract" })).id;
  await updateDocument(db, a, documentId, { roles: ["Client", "Agency"] });
});
afterEach(async () => {
  await close();
});

const summary = async () =>
  (await getDocument(db, a, documentId)).recipients.map((r) => [r.name, r.role, r.kind, r.ordering]);

describe("recipients", () => {
  it("adds signers with a role and copies without one, in order", async () => {
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    await addRecipient(db, a, documentId, { contactId: sam, role: "Agency", kind: "signer" });
    await addRecipient(db, a, documentId, { contactId: pat, kind: "cc", role: "Client" });
    expect(await summary()).toEqual([
      ["Jane", "Client", "signer", 1],
      ["Sam", "Agency", "signer", 2],
      ["Pat", null, "cc", 3],
    ]);
  });

  it.each([
    [{ contactId: "", role: "Client" }, "Choose a contact."],
    [{ role: "Witness" }, "Choose one of this document's roles for the signer."],
    [{ role: "" }, "Choose one of this document's roles for the signer."],
  ])("rejects invalid recipients %#", async (input, message) => {
    await expect(addRecipient(db, a, documentId, { contactId: jane, ...input })).rejects.toThrow(new ValidationError(message));
  });

  it("allows one recipient per role and per email", async () => {
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    const duplicate = new ValidationError("This document already has a recipient with that role or email address.");
    await expect(addRecipient(db, a, documentId, { contactId: sam, role: "Client" })).rejects.toThrow(duplicate);
    await expect(addRecipient(db, a, documentId, { contactId: jane, role: "Agency" })).rejects.toThrow(duplicate);
  });

  it("reorders and removes recipients", async () => {
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    const second = await addRecipient(db, a, documentId, { contactId: sam, role: "Agency" });
    await moveRecipient(db, a, documentId, second.id, "up");
    expect((await summary()).map(([name, , , order]) => [name, order])).toEqual([
      ["Sam", 1],
      ["Jane", 2],
    ]);
    await moveRecipient(db, a, documentId, second.id, "up");
    await removeRecipient(db, a, documentId, second.id);
    expect((await summary()).map(([name]) => name)).toEqual(["Jane"]);
  });

  it("changes recipients on drafts only", async () => {
    const added = await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, documentId));
    const draftOnly = new ValidationError("Only draft documents can be edited.");
    await expect(addRecipient(db, a, documentId, { contactId: sam, role: "Agency" })).rejects.toThrow(draftOnly);
    await expect(removeRecipient(db, a, documentId, added.id)).rejects.toThrow(draftOnly);
    await expect(moveRecipient(db, a, documentId, added.id, "down")).rejects.toThrow(draftOnly);
  });

  it("refuses other organizations' documents and contacts", async () => {
    const bobContact = (await createContact(db, b, { name: "Bob", email: "bob@globex.com" })).id;
    await expect(addRecipient(db, b, documentId, { contactId: bobContact, role: "Client" })).rejects.toThrow(
      new NotFoundError("Document not found."),
    );
    await expect(addRecipient(db, a, documentId, { contactId: bobContact, role: "Client" })).rejects.toThrow(
      new NotFoundError("Contact not found."),
    );
    const added = await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    await expect(removeRecipient(db, b, documentId, added.id)).rejects.toThrow(NotFoundError);
    await expect(removeRecipient(db, a, documentId, "missing")).rejects.toThrow(new NotFoundError("Recipient not found."));
  });

  it("reports readiness from the stored document", async () => {
    const document = await getDocument(db, a, documentId);
    expect(await documentReadiness(db, a, document)).toEqual(["Add at least one recipient."]);
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    expect(await documentReadiness(db, a, await getDocument(db, a, documentId))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/server/readiness.test.ts tests/server/recipients.test.ts`
Expected: FAIL with "Failed to resolve import "@/server/documents/readiness"".

- [ ] **Step 4: Implement `src/server/documents/readiness.ts`**

```ts
import type { JSONContent } from "@tiptap/core";
import type { Db } from "@/db/types";
import type { DocumentType } from "@/lib/documents";
import { countQuoteBlocks, extractFields, extractVariables } from "@/lib/editor/content";
import type { Quote } from "@/lib/quote/schema";
import { computeQuote, QuoteError } from "@/lib/quote/totals";
import type { OrgContext } from "@/server/tenancy";
import { type DocumentDetail, documentVariableValues } from "./documents";

export type ReadinessInput = {
  type: DocumentType;
  content: JSONContent;
  quote: Quote | null;
  recipients: { role: string | null; kind: "signer" | "cc" }[];
  variableValues: Record<string, string>;
};

/** Everything that blocks sending, as messages for the member. An empty list means ready. */
export function checkSendReadiness(input: ReadinessInput): string[] {
  const problems: string[] = [];
  const signerRoles = new Set(input.recipients.filter((r) => r.kind === "signer").map((r) => r.role));

  if (input.recipients.length === 0) problems.push("Add at least one recipient.");
  else if (input.type !== "invoice" && signerRoles.size === 0) problems.push("Add at least one signer.");

  for (const role of new Set(extractFields(input.content).map((field) => field.role))) {
    if (!signerRoles.has(role)) problems.push(`Fields for the ${role} role have no signer. Add a signer with that role.`);
  }

  for (const name of extractVariables(input.content)) {
    if (!input.variableValues[name]) problems.push(`The variable [${name}] has no value.`);
  }

  const quoteBlocks = countQuoteBlocks(input.content);
  if (quoteBlocks > 0 && !input.quote) problems.push("The content has a pricing table block but the document has no pricing table.");
  if (input.quote && quoteBlocks === 0) problems.push("Insert the pricing table block where the pricing table should appear.");

  if (input.quote) {
    try {
      const totals = computeQuote(input.quote);
      for (const section of input.quote.sections) {
        if (section.kind === "multichoice" && section.items.length > 0 && !section.items.some((item) => item.selected)) {
          problems.push(`Choose an option in the section "${section.title || "Untitled"}".`);
        }
      }
      if (input.type === "invoice" && totals.total === 0) problems.push("An invoice needs a total above zero.");
    } catch (error) {
      if (!(error instanceof QuoteError)) throw error;
      problems.push(error.message);
    }
  } else if (input.type === "invoice") {
    problems.push("An invoice needs a pricing table with a total above zero.");
  }
  return problems;
}

export async function documentReadiness(db: Db, ctx: OrgContext, document: DocumentDetail): Promise<string[]> {
  return checkSendReadiness({
    type: document.type,
    content: document.content,
    quote: document.quote,
    recipients: document.recipients,
    variableValues: await documentVariableValues(db, ctx, document),
  });
}
```

- [ ] **Step 5: Implement `src/server/documents/recipients.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { recipients } from "@/db/schema";
import type { Db } from "@/db/types";
import { getContact } from "@/server/contacts/contacts";
import { isUniqueViolation } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";
import { getDraftDocument, type Recipient } from "./documents";

const AddInput = z.object({
  contactId: z.string().trim().min(1, "Choose a contact."),
  kind: z.enum(["signer", "cc"]).default("signer"),
  role: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(40).nullable().default(null),
  ),
});

export async function addRecipient(db: Db, ctx: OrgContext, documentId: string, input: unknown): Promise<Recipient> {
  const data = parseInput(AddInput, input);
  const document = await getDraftDocument(db, ctx, documentId);
  const contact = await getContact(db, ctx, data.contactId);
  const role = data.kind === "signer" ? data.role : null;
  if (data.kind === "signer" && (!role || !document.roles.includes(role))) {
    throw new ValidationError("Choose one of this document's roles for the signer.");
  }
  const ordering = Math.max(0, ...document.recipients.map((recipient) => recipient.ordering)) + 1;
  try {
    const [recipient] = await db
      .insert(recipients)
      .values({
        organizationId: ctx.organizationId,
        documentId,
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        role,
        kind: data.kind,
        ordering,
      })
      .returning();
    return recipient;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError("This document already has a recipient with that role or email address.");
    }
    throw error;
  }
}

export async function removeRecipient(db: Db, ctx: OrgContext, documentId: string, recipientId: string): Promise<void> {
  await getDraftDocument(db, ctx, documentId);
  const deleted = await db
    .delete(recipients)
    .where(
      and(
        eq(recipients.id, recipientId),
        eq(recipients.documentId, documentId),
        eq(recipients.organizationId, ctx.organizationId),
      ),
    )
    .returning({ id: recipients.id });
  if (deleted.length === 0) throw new NotFoundError("Recipient not found.");
}

export async function moveRecipient(
  db: Db,
  ctx: OrgContext,
  documentId: string,
  recipientId: string,
  direction: "up" | "down",
): Promise<void> {
  const document = await getDraftDocument(db, ctx, documentId);
  const list = document.recipients;
  const index = list.findIndex((recipient) => recipient.id === recipientId);
  if (index === -1) throw new NotFoundError("Recipient not found.");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return;
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await db.transaction(async (tx) => {
    for (const [position, recipient] of reordered.entries()) {
      await tx
        .update(recipients)
        .set({ ordering: position + 1 })
        .where(and(eq(recipients.id, recipient.id), eq(recipients.organizationId, ctx.organizationId)));
    }
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/server/readiness.test.ts tests/server/recipients.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/documents/recipients.ts src/server/documents/readiness.ts tests/server/recipients.test.ts tests/server/readiness.test.ts
git commit -m "feat: add document recipients and the send-readiness check"
```

---
### Task 13: Document pages

**Files:**
- Create: `src/components/editor/pricing-table-section.tsx`
- Create: `src/app/app/payment-fields.tsx`
- Modify: `src/app/app/templates/[id]/template-workspace.tsx` (use the two shared components)
- Create: `src/app/app/documents/actions.ts`
- Create: `src/app/app/documents/page.tsx`
- Create: `src/app/app/documents/new/page.tsx`
- Create: `src/app/app/documents/new/new-document-form.tsx`
- Create: `src/app/app/documents/[id]/page.tsx`
- Create: `src/app/app/documents/[id]/document-workspace.tsx`
- Create: `src/app/app/documents/[id]/recipients-panel.tsx`
- Modify: `src/app/app/layout.tsx` (nav link)

**Interfaces:**
- Consumes: document service (Task 11), recipients and readiness (Task 12), `listContacts` (Task 6), `listProducts` (Task 7), `listTemplates` (Task 8), `RichEditor` (Task 9), `QuoteEditor`, `CatalogOption` (Task 10), `extractVariables`, `countQuoteBlocks` (Task 3), `parseRoleList` (Task 9), labels from Task 4, `formatMoney` (Task 1), app helpers (Task 6).
- Produces:
  - `<PricingTableSection quote content onChange products currencies defaultCurrency editable? />` where `onChange(quote: Quote | null)`
  - `<PaymentFields mode percent onModeChange onPercentChange disabled? />` where `percent` is the input text
  - Server actions `createDocumentAction(prev, formData)`, `saveDocumentAction(id, input)`, `deleteDocumentAction(id)`, `addRecipientAction(documentId, prev, formData)`, `removeRecipientAction(documentId, recipientId)`, `moveRecipientAction(documentId, recipientId, direction)`
  - Pages `/app/documents`, `/app/documents/new`, `/app/documents/[id]`

The document page shows: header (name, type, number, status label, total), a notice when the document is not a draft, the send-readiness checklist, recipients (signing order, move, remove, add from contacts as signer with a role or as copy), and the workspace (name, client contact, roles, editor, pricing table, values for the variables used in the content with automatic values as placeholders, payment settings, Save). After a successful save the page refreshes so the checklist and totals update. Non-draft documents render read-only.

- [ ] **Step 1: Extract the shared pricing-table and payment components**

Create `src/components/editor/pricing-table-section.tsx`:

```tsx
"use client";

import type { JSONContent } from "@tiptap/react";
import { countQuoteBlocks } from "@/lib/editor/content";
import { emptyQuote, type Quote } from "@/lib/quote/schema";
import { type CatalogOption, QuoteEditor } from "./quote-editor";

const button = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 disabled:opacity-60";

export function PricingTableSection({
  quote,
  content,
  onChange,
  products,
  currencies,
  defaultCurrency,
  editable = true,
}: {
  quote: Quote | null;
  content: JSONContent;
  onChange: (quote: Quote | null) => void;
  products: CatalogOption[];
  currencies: string[];
  defaultCurrency: string;
  editable?: boolean;
}) {
  if (!quote) {
    return editable ? (
      <button type="button" className={button} onClick={() => onChange(emptyQuote(defaultCurrency))}>
        Add pricing table
      </button>
    ) : null;
  }
  return (
    <div className="space-y-2">
      {countQuoteBlocks(content) === 0 && (
        <p className="text-sm text-amber-700">Insert the “Pricing table” block in the content where the table should appear.</p>
      )}
      <QuoteEditor quote={quote} onChange={onChange} products={products} currencies={currencies} editable={editable} />
      {editable && (
        <button type="button" className={button} onClick={() => onChange(null)}>
          Remove pricing table
        </button>
      )}
    </div>
  );
}
```

Create `src/app/app/payment-fields.tsx`:

```tsx
"use client";

import { PAYMENT_MODE_LABELS, PAYMENT_MODES, type PaymentMode } from "@/lib/documents";
import { inputClass } from "./ui";

export function PaymentFields({
  mode,
  percent,
  onModeChange,
  onPercentChange,
  disabled,
}: {
  mode: PaymentMode;
  percent: string;
  onModeChange: (mode: PaymentMode) => void;
  onPercentChange: (percent: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">Payment</legend>
      <label className="block text-sm">
        Collect payment
        <select value={mode} onChange={(event) => onModeChange(event.target.value as PaymentMode)} className={inputClass}>
          {PAYMENT_MODES.map((option) => (
            <option key={option} value={option}>
              {PAYMENT_MODE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      {mode === "deposit_percent" && (
        <label className="block text-sm">
          Deposit percent
          <input
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(event) => onPercentChange(event.target.value)}
            className={inputClass}
          />
        </label>
      )}
    </fieldset>
  );
}
```

In `src/app/app/templates/[id]/template-workspace.tsx`, replace the pricing-table block added in Task 10 with:

```tsx
      <PricingTableSection
        quote={quote}
        content={content}
        onChange={setQuote}
        products={products}
        currencies={currencies}
        defaultCurrency={defaultCurrency}
      />
```

and replace the payment `<fieldset>…</fieldset>` with:

```tsx
      <PaymentFields
        mode={paymentMode}
        percent={paymentPercent}
        onModeChange={setPaymentMode}
        onPercentChange={setPaymentPercent}
      />
```

Then fix the imports: add `import { PricingTableSection } from "@/components/editor/pricing-table-section";` and `import { PaymentFields } from "../../payment-fields";`; import only `type CatalogOption` from `@/components/editor/quote-editor`; remove the now-unused `QuoteEditor`, `countQuoteBlocks`, `emptyQuote`, `PAYMENT_MODE_LABELS`, `PAYMENT_MODES` and `secondaryButtonClass` imports. Run `npm run lint && npm run typecheck` and fix any unused-import errors before continuing.

- [ ] **Step 2: Add the document actions**

Create `src/app/app/documents/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createDocument, deleteDocument, updateDocument } from "@/server/documents/documents";
import { addRecipient, moveRecipient, removeRecipient } from "@/server/documents/recipients";
import { type ActionState, actionError } from "../action-state";

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  let id: string;
  try {
    const type = String(formData.get("type") ?? "");
    const document = await createDocument(db, ctx, {
      type: type === "" ? undefined : type,
      name: String(formData.get("name") ?? ""),
      templateId: String(formData.get("templateId") ?? ""),
      contactId: String(formData.get("contactId") ?? ""),
    });
    id = document.id;
  } catch (error) {
    return actionError("documents", error);
  }
  revalidatePath("/app/documents");
  redirect(`/app/documents/${id}`);
}

/** Saves the editable parts of a draft; the service validates every field and recomputes totals. */
export async function saveDocumentAction(id: string, input: unknown): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateDocument(db, ctx, id, input);
    revalidatePath("/app/documents");
    revalidatePath(`/app/documents/${id}`);
    return { ok: true, message: "Document saved." };
  } catch (error) {
    return actionError("documents", error);
  }
}

export async function deleteDocumentAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteDocument(db, ctx, id);
  revalidatePath("/app/documents");
  redirect("/app/documents");
}

export async function addRecipientAction(documentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await addRecipient(db, ctx, documentId, {
      contactId: String(formData.get("contactId") ?? ""),
      kind: String(formData.get("kind") ?? "signer"),
      role: String(formData.get("role") ?? ""),
    });
    revalidatePath(`/app/documents/${documentId}`);
    return { ok: true, message: "Recipient added." };
  } catch (error) {
    return actionError("documents", error);
  }
}

export async function removeRecipientAction(documentId: string, recipientId: string): Promise<void> {
  const { ctx } = await requireMember();
  await removeRecipient(db, ctx, documentId, recipientId);
  revalidatePath(`/app/documents/${documentId}`);
}

export async function moveRecipientAction(documentId: string, recipientId: string, direction: "up" | "down"): Promise<void> {
  const { ctx } = await requireMember();
  await moveRecipient(db, ctx, documentId, recipientId, direction === "up" ? "up" : "down");
  revalidatePath(`/app/documents/${documentId}`);
}
```

- [ ] **Step 3: Add the document list page**

Create `src/app/app/documents/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { listDocuments } from "@/server/documents/documents";
import { buttonClass, inputClass, secondaryButtonClass } from "../ui";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  const { ctx } = await requireMember();
  const { status = "", type = "" } = await searchParams;
  const filters = {
    status: (DOCUMENT_STATUSES as readonly string[]).includes(status) ? (status as DocumentStatus) : undefined,
    type: (DOCUMENT_TYPES as readonly string[]).includes(type) ? (type as DocumentType) : undefined,
  };
  const documents = await listDocuments(db, ctx, filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Link href="/app/documents/new" className={buttonClass}>
          New document
        </Link>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Status
          <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">All</option>
            {DOCUMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Type
          <select name="type" defaultValue={filters.type ?? ""} className={inputClass}>
            <option value="">All</option>
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filter
        </button>
      </form>
      {documents.length === 0 ? (
        <p className="text-sm text-neutral-600">No documents match. Create one from a template.</p>
      ) : (
        <table className="w-full rounded-md border border-neutral-200 bg-white text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {documents.map((document) => (
              <tr key={document.id}>
                <td className="px-3 py-2 text-neutral-600">{document.number}</td>
                <td className="px-3 py-2">
                  <Link href={`/app/documents/${document.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                    {document.name}
                  </Link>
                  <span className="ml-2 text-neutral-500">{DOCUMENT_TYPE_LABELS[document.type]}</span>
                </td>
                <td className="px-3 py-2">{document.contactName ?? "—"}</td>
                <td className="px-3 py-2">{DOCUMENT_STATUS_LABELS[document.status]}</td>
                <td className="px-3 py-2 text-right">{formatMoney(document.total, document.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the new-document page**

Create `src/app/app/documents/new/new-document-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/lib/documents";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { createDocumentAction } from "../actions";

export function NewDocumentForm({
  templates,
  contacts,
}: {
  templates: { id: string; name: string }[];
  contacts: { id: string; name: string; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(createDocumentAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        Template
        <select name="templateId" defaultValue="" className={inputClass}>
          <option value="">Blank document</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Client
        <select name="contactId" defaultValue="" className={inputClass}>
          <option value="">Choose later</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name} ({contact.email})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Type
        <select name="type" defaultValue="" className={inputClass}>
          <option value="">Same as the template (proposal for a blank document)</option>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DOCUMENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Name (optional)
        <input name="name" placeholder="Defaults to the template name" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create document"}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
```

Create `src/app/app/documents/new/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { listContacts } from "@/server/contacts/contacts";
import { listTemplates } from "@/server/templates/templates";
import { NewDocumentForm } from "./new-document-form";

export default async function NewDocumentPage() {
  const { ctx } = await requireMember();
  const [templates, contacts] = await Promise.all([listTemplates(db, ctx), listContacts(db, ctx)]);
  return (
    <div className="space-y-6">
      <Link href="/app/documents" className="text-sm text-neutral-600 hover:underline">
        ← Documents
      </Link>
      <h1 className="text-2xl font-semibold">New document</h1>
      <NewDocumentForm
        templates={templates.map(({ id, name }) => ({ id, name }))}
        contacts={contacts.map(({ id, name, email }) => ({ id, name, email }))}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the recipients panel**

Create `src/app/app/documents/[id]/recipients-panel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { addRecipientAction, moveRecipientAction, removeRecipientAction } from "../actions";

export type RecipientView = { id: string; name: string; email: string; role: string | null; kind: "signer" | "cc" };

const small = "rounded border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-40";

export function RecipientsPanel({
  documentId,
  recipients,
  roles,
  contacts,
  editable,
}: {
  documentId: string;
  recipients: RecipientView[];
  roles: string[];
  contacts: { id: string; name: string; email: string }[];
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(addRecipientAction.bind(null, documentId), null);
  const [kind, setKind] = useState<"signer" | "cc">("signer");

  return (
    <section aria-labelledby="recipients-heading" className="rounded-md border border-neutral-200 bg-white p-4">
      <h2 id="recipients-heading" className="mb-3 text-sm font-semibold">
        Recipients (in signing order)
      </h2>
      {recipients.length === 0 ? (
        <p className="mb-3 text-sm text-neutral-600">No recipients yet.</p>
      ) : (
        <ol className="mb-4 divide-y divide-neutral-200">
          {recipients.map((recipient, index) => (
            <li key={recipient.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {index + 1}. {recipient.name} · {recipient.email}
              </span>
              <span className="text-neutral-500">{recipient.kind === "signer" ? `Signer · ${recipient.role}` : "Copy"}</span>
              {editable && (
                <span className="flex gap-1">
                  <form action={moveRecipientAction.bind(null, documentId, recipient.id, "up")}>
                    <button type="submit" className={small} disabled={index === 0} aria-label={`Move ${recipient.name} up`}>
                      ↑
                    </button>
                  </form>
                  <form action={moveRecipientAction.bind(null, documentId, recipient.id, "down")}>
                    <button
                      type="submit"
                      className={small}
                      disabled={index === recipients.length - 1}
                      aria-label={`Move ${recipient.name} down`}
                    >
                      ↓
                    </button>
                  </form>
                  <form action={removeRecipientAction.bind(null, documentId, recipient.id)}>
                    <button type="submit" className={small} aria-label={`Remove ${recipient.name}`}>
                      Remove
                    </button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {editable &&
        (contacts.length === 0 ? (
          <p className="text-sm text-neutral-600">
            <Link href="/app/contacts" className="text-[#6b2d5c] underline">
              Add a contact
            </Link>{" "}
            to choose recipients.
          </p>
        ) : (
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              Contact
              <select name="contactId" required className={inputClass}>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} ({contact.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              As
              <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "signer" | "cc")} className={inputClass}>
                <option value="signer">Signer</option>
                <option value="cc">Copy</option>
              </select>
            </label>
            {kind === "signer" && (
              <label className="block text-sm">
                Role
                <select name="role" className={inputClass}>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" disabled={pending} className={buttonClass}>
              {pending ? "Adding…" : "Add recipient"}
            </button>
            <div className="w-full">
              <FormStatus state={state} />
            </div>
          </form>
        ))}
    </section>
  );
}
```

- [ ] **Step 6: Add the document workspace**

Create `src/app/app/documents/[id]/document-workspace.tsx`:

```tsx
"use client";

import type { JSONContent } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PricingTableSection } from "@/components/editor/pricing-table-section";
import type { CatalogOption } from "@/components/editor/quote-editor";
import { RichEditor } from "@/components/editor/rich-editor";
import type { PaymentMode } from "@/lib/documents";
import { extractVariables } from "@/lib/editor/content";
import type { Quote } from "@/lib/quote/schema";
import { parseRoleList } from "@/lib/roles";
import type { ActionState } from "../../action-state";
import { PaymentFields } from "../../payment-fields";
import { buttonClass, FormStatus, inputClass } from "../../ui";
import { saveDocumentAction } from "../actions";

export type DocumentData = {
  id: string;
  name: string;
  contactId: string | null;
  roles: string[];
  content: JSONContent;
  quote: Quote | null;
  variables: Record<string, string>;
  currency: string;
  paymentMode: PaymentMode;
  paymentPercent: number | null;
};

export function DocumentWorkspace({
  document,
  contacts,
  products,
  currencies,
  knownValues,
  editable,
}: {
  document: DocumentData;
  contacts: { id: string; name: string; email: string }[];
  products: CatalogOption[];
  currencies: string[];
  knownValues: Record<string, string>;
  editable: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(document.name);
  const [contactId, setContactId] = useState(document.contactId ?? "");
  const [rolesText, setRolesText] = useState(document.roles.join(", "));
  const [content, setContent] = useState<JSONContent>(document.content);
  const [quote, setQuote] = useState<Quote | null>(document.quote);
  const [variables, setVariables] = useState<Record<string, string>>(document.variables);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(document.paymentMode);
  const [paymentPercent, setPaymentPercent] = useState(document.paymentPercent?.toString() ?? "");
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const roles = parseRoleList(rolesText);
  const variableNames = extractVariables(content);

  function save() {
    startTransition(async () => {
      const result = await saveDocumentAction(document.id, {
        name,
        contactId: contactId === "" ? null : contactId,
        roles,
        content,
        quote,
        variables,
        paymentMode,
        paymentPercent: paymentPercent === "" ? null : Number(paymentPercent),
      });
      setStatus(result);
      if (result?.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Document name
          <input value={name} disabled={!editable} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          Client (fills the [Client.*] variables)
          <select value={contactId} disabled={!editable} onChange={(event) => setContactId(event.target.value)} className={inputClass}>
            <option value="">No client</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} ({contact.email})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Roles (comma separated; every field and signer belongs to a role)
        <input value={rolesText} disabled={!editable} onChange={(event) => setRolesText(event.target.value)} className={inputClass} />
      </label>

      <RichEditor initialContent={document.content} roles={roles} editable={editable} onChange={setContent} />

      <PricingTableSection
        quote={quote}
        content={content}
        onChange={setQuote}
        products={products}
        currencies={currencies}
        defaultCurrency={document.currency}
        editable={editable}
      />

      {variableNames.length > 0 && (
        <fieldset disabled={!editable} className="space-y-2 rounded-md border border-neutral-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Variables</legend>
          <p className="text-sm text-neutral-600">Leave a value empty to use the automatic one shown in grey.</p>
          {variableNames.map((variable) => (
            <label key={variable} className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">
              <code>[{variable}]</code>
              <input
                value={variables[variable] ?? ""}
                placeholder={knownValues[variable] ?? "No value yet"}
                onChange={(event) => setVariables({ ...variables, [variable]: event.target.value })}
                className={inputClass}
              />
            </label>
          ))}
        </fieldset>
      )}

      <PaymentFields
        mode={paymentMode}
        percent={paymentPercent}
        onModeChange={setPaymentMode}
        onPercentChange={setPaymentPercent}
        disabled={!editable}
      />

      {editable && (
        <div className="flex items-center gap-4">
          <button type="button" onClick={save} disabled={pending} className={buttonClass}>
            {pending ? "Saving…" : "Save document"}
          </button>
          <FormStatus state={status} />
        </div>
      )}
    </div>
  );
}
```

`knownValues` holds automatic values merged with saved custom values, so a saved custom value shows in both the input and the placeholder; that is expected.

- [ ] **Step 7: Add the document page**

Create `src/app/app/documents/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { listProducts } from "@/server/catalog/products";
import { listContacts } from "@/server/contacts/contacts";
import { documentVariableValues, getDocument } from "@/server/documents/documents";
import { documentReadiness } from "@/server/documents/readiness";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass } from "../../ui";
import { deleteDocumentAction } from "../actions";
import { DocumentWorkspace } from "./document-workspace";
import { RecipientsPanel } from "./recipients-panel";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const document = await loadOrNotFound(getDocument(db, ctx, id));
  const [contacts, products, knownValues, problems] = await Promise.all([
    listContacts(db, ctx),
    listProducts(db, ctx),
    documentVariableValues(db, ctx, document),
    documentReadiness(db, ctx, document),
  ]);
  const editable = document.status === "draft";
  const contactOptions = contacts.map(({ id: contactId, name, email }) => ({ id: contactId, name, email }));

  return (
    <div className="space-y-6">
      <Link href="/app/documents" className="text-sm text-neutral-600 hover:underline">
        ← Documents
      </Link>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{document.name}</h1>
        <p className="text-sm text-neutral-600">
          {DOCUMENT_TYPE_LABELS[document.type]} {document.number} · {DOCUMENT_STATUS_LABELS[document.status]} ·{" "}
          {formatMoney(document.total, document.currency)}
        </p>
      </header>

      {!editable && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          This document is {DOCUMENT_STATUS_LABELS[document.status].toLowerCase()}. Only drafts can be edited.
        </p>
      )}

      <section aria-labelledby="readiness-heading" className="rounded-md border border-neutral-200 bg-white p-4">
        <h2 id="readiness-heading" className="mb-2 text-sm font-semibold">
          Ready to send?
        </h2>
        {problems.length === 0 ? (
          <p className="text-sm text-green-700">Everything needed to send is in place.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </section>

      <RecipientsPanel
        documentId={document.id}
        recipients={document.recipients.map(({ id: recipientId, name, email, role, kind }) => ({ id: recipientId, name, email, role, kind }))}
        roles={document.roles}
        contacts={contactOptions}
        editable={editable}
      />

      <DocumentWorkspace
        document={{
          id: document.id,
          name: document.name,
          contactId: document.contactId,
          roles: document.roles,
          content: document.content,
          quote: document.quote,
          variables: document.variables,
          currency: document.currency,
          paymentMode: document.paymentMode,
          paymentPercent: document.paymentPercent,
        }}
        contacts={contactOptions}
        products={products.map(({ id: productId, title, description, unitPrice, currency, sku }) => ({
          id: productId,
          title,
          description,
          unitPrice,
          currency,
          sku,
        }))}
        currencies={Intl.supportedValuesOf("currency")}
        knownValues={knownValues}
        editable={editable}
      />

      {editable && (
        <form action={deleteDocumentAction.bind(null, document.id)} className="border-t border-neutral-200 pt-6">
          <ConfirmButton message="Delete this draft and its recipients?" label="Delete draft" className={dangerButtonClass} />
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Add the nav link**

In `src/app/app/layout.tsx`, add `<Link href="/app/documents">Documents</Link>` right after Dashboard. The final nav order is Dashboard, Documents, Templates, Contacts, Catalog, Settings.

- [ ] **Step 9: Verify lint, types, tests and build**

Run: `npm run lint && npm run typecheck && npm test`, then the build command from Task 6 Step 9.
Expected: all pass; the build lists `/app/documents`, `/app/documents/new` and `/app/documents/[id]`.

- [ ] **Step 10: Commit**

```bash
git add src/components/editor src/app/app
git commit -m "feat: add document pages with recipients, variables and readiness"
```

---

### Task 14: Release 0.2.0

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`, `package-lock.json` (version)
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-10-13-pactplum-plan-1-followups.md`

**Interfaces:**
- Consumes: everything above.
- Produces: version `0.2.0` and its changelog entry. The `v0.2.0` tag is created by the maintainer's session after the pull request is merged, not in this task.

- [ ] **Step 1: Make sure the changelog is on this branch**

Run: `git fetch origin && git ls-tree origin/main --name-only | grep -x CHANGELOG.md`
If it prints `CHANGELOG.md`, run `git merge origin/main` to bring in the changelog; if the merge reports a conflict, stop and report it instead of resolving it. If it prints nothing, stop and report BLOCKED: the changelog pull request has not been merged yet.

- [ ] **Step 2: Add the 0.2.0 entry**

In `CHANGELOG.md`, directly under `## [Unreleased]`, insert (use today's date from `date +%Y-%m-%d`):

```markdown

## [0.2.0] - YYYY-MM-DD

### Added

- Contacts: add, search, edit and delete clients. Email addresses are unique within an organization.
- Product catalog: prices stored in minor units for any ISO 4217 currency, including zero- and three-decimal currencies, with optional SKUs and a billing type.
- Templates with a block editor: headings, text, lists, tables, page breaks, a pricing-table block, signature, date, text and checkbox fields assigned to roles, and `[Group.Name]` variables.
- Pricing tables: sections, a catalog picker, custom columns with safe formulas, optional lines, choose-one sections, line and quote discounts, quote tax and live totals. The server recomputes every total.
- Documents (proposal, quote, contract, invoice) created from a template for a client, numbered per type (`P-0001`, `Q-0001`, `C-0001`, `INV-0001`), with recipients in signing order, custom variable values, payment settings and a send-readiness checklist.
- Navigation for Documents, Templates, Contacts and Catalog.
```

Replace `YYYY-MM-DD` with the date. Then replace the link lines at the bottom with:

```markdown
[Unreleased]: https://github.com/Level-Up-Studios-LLC/PactPlum/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Level-Up-Studios-LLC/PactPlum/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Level-Up-Studios-LLC/PactPlum/releases/tag/v0.1.0
```

- [ ] **Step 3: Bump the version**

Set `"version": "0.2.0"` in `package.json`, then run `npm install --package-lock-only` so `package-lock.json` records the same version. Run `git diff package-lock.json` and confirm only the two version fields changed.

- [ ] **Step 4: Describe what works in the README**

In `README.md`, insert after the `> Status: early development. Not ready for production use.` line:

```markdown

What works today (0.2.0): invite-only sign-in, organization settings and SMTP email; contacts; a product catalog; templates built in a block editor with pricing tables, fields and variables; and draft documents created from templates with recipients and a send-readiness checklist. Sending, e-signing, PDFs and payments arrive in the next releases.
```

- [ ] **Step 5: Record what moved to Plan 3**

Append to `docs/superpowers/plans/2026-10-13-pactplum-plan-1-followups.md`:

```markdown

## Moved from Plan 2 to Plan 3

- Image block in the editor, with S3-compatible storage (type and size limits from spec section 12). Plan 3 needs storage for signature images and PDFs anyway.
- `fields` table: created on send from the field nodes in the frozen revision.
- `settings` table: signature modes, default expiry (60 days), ESIGN consent text.
- Editing a sent or viewed document returns it to draft and invalidates its tokens (`edit` transition exists in `src/server/documents/lifecycle.ts`).
- Send must call `checkSendReadiness` and refuse while it reports problems, then resolve variables with `resolveVariables` into the revision.
```

- [ ] **Step 6: Run the full verification**

Run: `npm run lint && npm run typecheck && npm test`, then the build command from Task 6 Step 9.
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md package.json package-lock.json README.md docs/superpowers/plans/2026-10-13-pactplum-plan-1-followups.md
git commit -m "chore: release 0.2.0"
```

After the pull request is merged, the maintainer's session tags the merge commit: `git tag -a v0.2.0 <merge-commit> -m "PactPlum 0.2.0"` and `git push origin v0.2.0`.
