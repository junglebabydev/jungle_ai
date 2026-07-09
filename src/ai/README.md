# `src/ai/` — the AI chat code

Read this first. The whole folder is built around **three simple words**: **brains**, **doors**, and the **runner**.

- A **brain** (in `assistants/`) decides *what to say* — its own prompt, its own tools.
- A **door** (in `channels/`) is a *way a person reaches a brain* (WhatsApp, etc.).
- The **runner** (in `runner/`) is the *one engine every brain shares* — it runs the
  message→model→tools→reply loop, so a brain only describes its differences.
- **`shared/`** is small safety/telemetry plumbing every brain reuses.

```
src/ai/
  runner/                    <- ONE shared engine (the message loop, run once).
                                [PLANNED — being introduced. Today the loop still
                                lives inside each brain's loop.ts; the runner
                                extracts the shared part so a brain only describes
                                its differences via an "AssistantDefinition":
                                guard input -> call model -> run tools -> redact
                                -> persist -> telemetry.]

  assistants/                <- the BRAINS (each = a small definition for the runner)
    merchant/                  helps a STORE OWNER run their store. It can make
                               changes, so every change waits for a "Confirm" tap
                               (the `gate`). Needs login + permissions. Has tools/.
    concierge/                 helps a PARENT (no login). Read-only — it LOOKS
                               THINGS UP. ONE engine (loop.ts), TWO modes you
                               can open as files:
                                 • productDiscovery.ts — search ALL merchants (product discovery) (the
                                   /concierge page)
                                 • merchantLocationChat.ts — chat scoped to ONE merchant/location
                                   ("the concierge for THIS place")
                               Both call the same loop; venue just passes a
                               ConciergeScope. The router picks the mode by
                               whether the request carries merchantId/locationId.

  channels/                  <- the DOORS (how people reach a brain)
    whatsapp/
      merchant.ts              WhatsApp talking to the merchant brain.
                               (WhatsApp for parents later = add whatsapp/concierge.ts.)

  shared/                    <- used by ALL brains
    guard.ts                   checks messages in & cleans replies out (safety)
    evalLog.ts                 writes down what happened (telemetry)
```

The **web door** isn't here — it's a normal HTTP route in `src/routers/`
(`merchantChatRouter.ts` → merchant brain, `conciergeRouter.ts` → concierge brain).

## How one message flows

1. A message comes in through a **door** (a `channels/...` file, or a router).
2. The door calls the brain's turn-runner:
   - merchant brain → `runMerchantTurn(...)` (`assistants/merchant/`)
   - concierge brain → `runConciergeTurn(...)` (`assistants/concierge/`), with an
     optional scope (global vs a merchant/location).
3. Those call the shared **runner** with that brain's definition. The runner
   `shared/guard`s the input, talks to the model, runs the brain's tools, redacts,
   persists, and returns the reply. The door formats it for its screen and sends it.

## Where do I put a new thing?

| I want to… | Put it in… |
| --- | --- |
| Add a brand-new AI assistant | `assistants/<name>/` (a definition for the runner) |
| Reach an existing brain a new way | `channels/<door>/<brain>.ts` |
| Scope the parent chat to one merchant/location | it's already concierge — pass the scope |
| Add a tool the merchant brain can use | `assistants/merchant/tools/` (+ register it) |
| Change the loop itself (retries, streaming, budget) | `runner/` — once, for everyone |
| Add safety / logging shared by all brains | `shared/` |

## Rules that keep it tidy

1. **One runner.** The message loop lives in `runner/` exactly once; brains never copy it.
2. **Brains never import each other.** Shared code → `shared/`.
3. **A door talks to ONE brain.** The pairing is the filename (`whatsapp/merchant.ts`).
4. **Scope is an input, not a new brain.** Global vs venue concierge is the same brain.

For the full layer rules see `.claude/rules/02-architecture.md` (the *Agent* rows).
