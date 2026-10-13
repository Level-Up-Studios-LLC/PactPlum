ALTER TABLE "documents" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "documents_org_updated_idx" ON "documents" USING btree ("organization_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);