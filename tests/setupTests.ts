import { config } from "dotenv";

// Load .env so any module that reads config at import time has values, then force
// safe fallbacks so the suite runs even when .env is absent (e.g. CI). The AI unit
// tests mock ServiceLocator / the model client per file, so no real service, DB, or
// model provider is ever reached — these fallbacks only keep import-time reads happy.
config();
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://test:test@localhost:5432/test?schema=public";
