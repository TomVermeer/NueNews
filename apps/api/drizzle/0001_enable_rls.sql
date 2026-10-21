-- Row-level security with no policies: nobody but the table owner can read or write these tables
-- through Postgres roles. Hosted Postgres services such as Supabase expose tables through a
-- public REST API for their "anon" and "authenticated" roles; with no policies those roles see
-- nothing. The API connects as the owner, which bypasses RLS, and scopes every query by user.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "widget_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weather_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;
