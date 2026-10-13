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
