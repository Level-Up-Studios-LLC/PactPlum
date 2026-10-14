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
