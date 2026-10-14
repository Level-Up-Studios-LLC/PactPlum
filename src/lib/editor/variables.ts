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
