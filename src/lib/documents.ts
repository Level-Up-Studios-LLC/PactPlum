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
