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
