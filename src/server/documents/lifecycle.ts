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
