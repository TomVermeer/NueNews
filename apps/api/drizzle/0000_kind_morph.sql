CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_blob" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_state" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"seen_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "item_state_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"excerpt" text,
	"image_url" text,
	"author" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"title" text,
	"site_url" text,
	"favicon_url" text,
	"interval_min" integer DEFAULT 30 NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"next_fetch_at" timestamp with time zone NOT NULL,
	"last_status" text,
	"error_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_sources" (
	"widget_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "widget_sources_widget_id_source_id_pk" PRIMARY KEY("widget_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" text PRIMARY KEY NOT NULL,
	"dashboard_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"color" text,
	"config" jsonb NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"w" integer DEFAULT 1 NOT NULL,
	"h" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_state" ADD CONSTRAINT "item_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_state" ADD CONSTRAINT "item_state_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sources" ADD CONSTRAINT "widget_sources_widget_id_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sources" ADD CONSTRAINT "widget_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_user_provider_uq" ON "credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "dashboards_user_idx" ON "dashboards" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_external_uq" ON "items" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "items_source_published_idx" ON "items" USING btree ("source_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_kind_key_uq" ON "sources" USING btree ("kind","key");--> statement-breakpoint
CREATE INDEX "sources_next_fetch_idx" ON "sources" USING btree ("next_fetch_at");--> statement-breakpoint
CREATE INDEX "widgets_dashboard_idx" ON "widgets" USING btree ("dashboard_id");