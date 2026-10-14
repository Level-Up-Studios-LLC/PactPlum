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

  it("names the refused action in the error message", () => {
    expect(() => transition("draft", "request_payment")).toThrow("A draft document cannot request payment.");
  });

  const inherited = ["constructor", "toString", "__proto__", "hasOwnProperty"] as const;

  it.each(inherited)("refuses inherited name %s as a status", (name) => {
    expect(canTransition(name as never, "send")).toBe(false);
    expect(() => transition(name as never, "send")).toThrow(InvalidTransitionError);
  });

  it.each(inherited)("refuses inherited name %s as an event", (name) => {
    expect(canTransition("draft", name as never)).toBe(false);
    expect(() => transition("draft", name as never)).toThrow(InvalidTransitionError);
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
