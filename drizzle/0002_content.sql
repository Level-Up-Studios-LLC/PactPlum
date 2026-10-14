CREATE TYPE "public"."document_status" AS ENUM('draft', 'sent', 'viewed', 'completed', 'waiting_pay', 'paid', 'declined', 'voided');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('proposal', 'quote', 'contract', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('off', 'deposit_percent', 'full');--> statement-breakpoint
CREATE TYPE "public"."product_billing_type" AS ENUM('one_time', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recipient_kind" AS ENUM('signer', 'cc');--> statement-breakpoint
CREATE TYPE "public"."signer_state" AS ENUM('pending', 'viewed', 'signed', 'declined');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"phone" text,
	"address" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_email_normalized" CHECK ("contacts"."email" = lower(btrim("contacts"."email")))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "document_type" NOT NULL,
	"name" text NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"number" text NOT NULL,
	"template_id" text,
	"contact_id" text,
	"created_by_user_id" text,
	"content" jsonb NOT NULL,
	"quote" jsonb,
	"roles" text[] DEFAULT '{Client}'::text[] NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"currency" text NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"payment_mode" "payment_mode" DEFAULT 'off' NOT NULL,
	"payment_percent" integer,
	"current_revision_id" text,
	"date_sent" timestamp with time zone,
	"date_completed" timestamp with time zone,
	"date_declined" timestamp with time zone,
	"date_expiration" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_currency_code" CHECK ("documents"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "documents_total_nonnegative" CHECK ("documents"."total" >= 0),
	CONSTRAINT "documents_payment_percent_range" CHECK ("documents"."payment_percent" IS NULL OR "documents"."payment_percent" BETWEEN 1 AND 100),
	CONSTRAINT "documents_deposit_has_percent" CHECK ("documents"."payment_mode" <> 'deposit_percent' OR "documents"."payment_percent" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "numbering_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"prefix" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "numbering_sequences_next_value_positive" CHECK ("numbering_sequences"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"sku" text,
	"description" text DEFAULT '' NOT NULL,
	"unit_price" bigint NOT NULL,
	"currency" text NOT NULL,
	"billing_type" "product_billing_type" DEFAULT 'one_time' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_unit_price_nonnegative" CHECK ("products"."unit_price" >= 0),
	CONSTRAINT "products_currency_code" CHECK ("products"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"document_id" text NOT NULL,
	"contact_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"kind" "recipient_kind" DEFAULT 'signer' NOT NULL,
	"ordering" integer DEFAULT 1 NOT NULL,
	"signer_state" "signer_state" DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipients_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "recipients_email_normalized" CHECK ("recipients"."email" = lower(btrim("recipients"."email"))),
	CONSTRAINT "recipients_signer_has_role" CHECK ("recipients"."kind" = 'cc' OR "recipients"."role" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"document_type" "document_type" DEFAULT 'proposal' NOT NULL,
	"content" jsonb NOT NULL,
	"roles" text[] DEFAULT '{Client}'::text[] NOT NULL,
	"quote" jsonb,
	"payment_mode" "payment_mode" DEFAULT 'off' NOT NULL,
	"payment_percent" integer,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_payment_percent_range" CHECK ("templates"."payment_percent" IS NULL OR "templates"."payment_percent" BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_sequences" ADD CONSTRAINT "numbering_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_org_email_idx" ON "contacts" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_number_idx" ON "documents" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "documents_org_status_idx" ON "documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "numbering_sequences_org_type_idx" ON "numbering_sequences" USING btree ("organization_id","document_type");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_idx" ON "products" USING btree ("organization_id","sku") WHERE sku IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recipients_document_idx" ON "recipients" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipients_document_role_idx" ON "recipients" USING btree ("document_id","role") WHERE role IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recipients_document_email_idx" ON "recipients" USING btree ("document_id","email");--> statement-breakpoint
CREATE INDEX "templates_org_idx" ON "templates" USING btree ("organization_id");