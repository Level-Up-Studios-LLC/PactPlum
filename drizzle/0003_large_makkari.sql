ALTER TABLE "documents" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;