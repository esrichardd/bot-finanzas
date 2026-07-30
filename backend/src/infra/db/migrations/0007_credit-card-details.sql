CREATE TABLE "credit_card_details" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"credit_limit" bigint NOT NULL,
	"cut_day" integer NOT NULL,
	"payment_due_day" integer NOT NULL,
	"management_fee" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_card_details" ADD CONSTRAINT "credit_card_details_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;