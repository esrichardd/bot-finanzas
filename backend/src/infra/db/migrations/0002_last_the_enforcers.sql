CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"parent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;