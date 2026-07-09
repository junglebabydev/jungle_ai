# jungle_ai

The Jungle **AI service** — the parent-facing **concierge** assistant and the
merchant-config **merchant** assistant, plus the channels they're reached through
(web chat + WhatsApp).

It is a standalone Express service that mirrors the `search_engine` setup: its own
Prisma client against the shared Postgres (each of the three services — `booking_system`,
`search_engine`, `jungle_ai` — gets an isolated DB later), its own copy of the shared
DTO/error/lib contracts, and an `x-api-key` service-auth boundary. `booking_system`
calls it over HTTP (an `aiClient`, exactly like it calls `searchClient`).

- **Port:** 4006
- **Health:** `GET /health`
- **Downstream:** `search_engine` (concierge search), OpenRouter (LLM), WhatsApp, Postgres.

See `MIGRATION.md` for the phased extraction from `booking_system`.
