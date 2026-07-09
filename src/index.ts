import "dotenv/config";
import cors from "cors";
import express from "express";
import { API_ROUTE_PREFIX } from "./shared/constants";
import { serviceAuthMiddleware } from "./middleware/serviceAuthMiddleware";
import { exceptionMiddleware } from "./middleware/exceptionMiddleware";
import aiRunRouter from "./routers/aiRunRouter";
import { startWhatsappWorker } from "./worker/whatsappWorker";

const app = express();

app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(express.json({ limit: "1mb" }));

// jungle_ai is INTERNAL-ONLY — reachable ONLY from booking_system's aiClient, never
// the public network. It runs the LLM assistant turns and nothing else: booking owns
// the public routers, the conversation lifecycle, and all DB CRUD (eval, whatsapp-link,
// conversations) on the shared database, and calls in here purely for compute. Every
// route sits behind the x-api-key service boundary.
//
// The externally-facing WhatsApp webhook also stays on booking — Meta can't reach this
// service. booking verifies the HMAC + enqueues to the shared job queue; the worker
// started below drains and processes it.
app.use(API_ROUTE_PREFIX.V1, serviceAuthMiddleware, aiRunRouter);

// Terminal error handler — serialises every ApplicationError to { code, message }.
app.use(exceptionMiddleware);

const PORT = Number(process.env.PORT ?? 4006);

app.listen(PORT, () => {
  console.log(`[jungle_ai] listening on :${PORT}`);

  // Drain the shared WhatsApp inbound queue (no-op if WhatsApp env isn't configured).
  // Only from here (the entrypoint) — never from a buildApp() the tests would load.
  startWhatsappWorker();
});
