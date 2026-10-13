DROP INDEX "invitations_org_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_org_email_idx" ON "invitations" USING btree ("organization_id","email") WHERE accepted_at IS NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_normalized" CHECK ("user"."email" = lower(btrim("user"."email")));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_normalized" CHECK ("invitations"."email" = lower(btrim("invitations"."email")));