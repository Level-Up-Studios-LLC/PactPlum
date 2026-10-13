"use client";

import { useId, useState } from "react";
import { newId } from "@/lib/ids";
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
import { columnIdProblem, nextColumnId, removeColumn, renameColumn } from "@/lib/quote/columns";
import { changeQuoteCurrency } from "@/lib/quote/currency";
import { computeQuote,type LineTotal, type QuoteTotals } from "@/lib/quote/totals";

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
    <>
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
        // The parent only hears about parsable text, so show the amount actually in use when the text is not.
        onBlur={() => {
          if (!valid) setText(minorToDecimalString(value, currency));
        }}
      />
      {!valid && (
        <span role="alert" className="block text-xs text-red-600">
          Use digits and an optional decimal point, e.g. 1250.50
        </span>
      )}
    </>
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

// The id is renamed on blur or Enter, never per keystroke: renaming moves saved line values and formula references,
// and intermediate states (renaming "ab" to "a" while a column "a" exists) must not merge them.
function ColumnIdInput({ quote, id, disabled, onRename }: { quote: Quote; id: string; disabled: boolean; onRename: (id: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();
  function commit() {
    if (draft === null) return;
    const next = draft.trim();
    const issue = columnIdProblem(quote, id, next);
    setDraft(null);
    setProblem(issue);
    if (!issue && next !== id) onRename(next);
  }
  return (
    <div>
      <input
        aria-label="Column id"
        aria-invalid={problem !== null}
        aria-describedby={problem ? problemId : undefined}
        value={draft ?? id}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value.toLowerCase());
          setProblem(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className={`${cell} ${problem ? "border-red-500" : ""}`}
      />
      {problem && (
        <span id={problemId} role="status" className="block text-xs text-red-600">
          {problem}
        </span>
      )}
    </div>
  );
}

function ColumnsEditor({ quote, editable, onChange }: { quote: Quote; editable: boolean; onChange: (patch: Partial<Quote>) => void }) {
  // Column ids are editable and columns have no other identity, so rows get their own stable keys:
  // keying by id would remount the row (and drop focus) on every keystroke in the id field.
  const [rowKeys, setRowKeys] = useState<string[]>(() => quote.columns.map(() => newId()));
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
        <div key={rowKeys[index] ?? `row-${index}`} className="mt-2 grid grid-cols-[1fr_1fr_7rem_1fr_auto] items-center gap-2">
          <ColumnIdInput quote={quote} id={column.id} disabled={!editable} onRename={(id) => onChange(renameColumn(quote, column.id, id))} />
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
            onClick={() => {
              setRowKeys((keys) => keys.filter((_, i) => i !== index));
              onChange(removeColumn(quote, column.id));
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`${smallButton} mt-3`}
        disabled={!editable}
        onClick={() => {
          const id = nextColumnId(quote.columns);
          setRowKeys((keys) => [...keys, newId()]);
          onChange({
            columns: [...quote.columns, { id, label: `Column ${id.slice("col_".length)}`, type: "number", formula: null }],
          });
        }}
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

  function changeCurrency(currency: string) {
    const hasAmounts =
      quote.sections.some((section) => section.items.length > 0) ||
      quote.discount?.type === "absolute" ||
      quote.tax?.type === "absolute";
    if (
      hasAmounts &&
      !window.confirm(
        "Change the currency? Amounts keep the same numbers (12.50 stays 12.50, rounded if the new currency has fewer decimals) and lines are unlinked from catalog products.",
      )
    ) {
      return;
    }
    onChange(changeQuoteCurrency(quote, currency));
  }
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
          <select value={quote.currency} disabled={!editable} onChange={(event) => changeCurrency(event.target.value)} className={cell}>
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
