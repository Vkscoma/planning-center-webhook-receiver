# Planning Center Notifier

A lightweight serverless webhook listener that sends you an email whenever songs are added or updated in your Planning Center Services plan.

## How It Works

```
Planning Center event
  → POST / (with X-PCO-Webhooks-Authenticity header)
    → Verify HMAC signature
      → Filter for song items
        → Durable Object debounces 30s
          → Resend API → Your inbox
```

## Stack

- **[Cloudflare Workers](https://workers.cloudflare.com)** — serverless hosting, free tier (100k requests/day)
- **[Resend](https://resend.com)** — email delivery, free tier (3,000 emails/month)
- **[Planning Center](https://api.planningcenteronline.com/webhooks)** — webhook source

## Prerequisites

- [Node.js](https://nodejs.org) version 20+ (wrangler 4 requirement)
- A [Cloudflare](https://cloudflare.com) account
- A [Resend](https://resend.com) account with a **verified sending domain**
- Access to Planning Center

> **Resend domain trap**: `onboarding@resend.dev` only delivers email to the address on your Resend account itself. If you use it as `NOTIFY_FROM` without a verified domain, the Resend API will return `403` silently and you'll receive no email. Use a domain verified in Resend, or use `onboarding@resend.dev` only for testing.

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/Vkscoma/planning-center-webhook-receiver.git
cd planning-center-webhook-receiver
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Configure environment variables

`NOTIFY_FROM` and `NOTIFY_NAME` ship as plain vars in `wrangler.jsonc` — edit them there:

```jsonc
"vars": {
	"NOTIFY_FROM": "onboarding@resend.dev",
	"NOTIFY_NAME": "there"
}
```

`NOTIFY_TO` is your personal address, so it is **not** in `wrangler.jsonc`. Set it as a secret along with your Resend API key:

```bash
npx wrangler secret put NOTIFY_TO
npx wrangler secret put RESEND_API_KEY
```

> **Why `NOTIFY_TO` is secret-only**: Cloudflare rejects a secret whose name collides with a plain-text var (API error `10053`). A name can be a var *or* a secret, never both — so a committed placeholder cannot be "overridden" by a secret later. Keeping `NOTIFY_TO` out of `vars` is what makes `wrangler secret put NOTIFY_TO` possible.

Deploy and note the URL:

```bash
npx wrangler deploy
```

Your Worker will be live at:
```
https://pc-notifier.<your-subdomain>.workers.dev
```

### 4. Create Planning Center webhooks

1. Go to [api.planningcenteronline.com/webhooks](https://api.planningcenteronline.com/webhooks)
2. Click **"Add a new subscription URL"**
3. Paste your Worker URL
4. Subscribe to the following events:
   - `services.v2.events.plan_item.created`
   - `services.v2.events.plan_item.updated`
5. Copy the secret for each event and store them as secrets:

```bash
npx wrangler secret put PCO_WEBHOOK_SECRET_CREATE
npx wrangler secret put PCO_WEBHOOK_SECRET_UPDATE
```

**Secrets take effect immediately** — no redeploy is needed after setting them.

### 5. Verify it works

Send a test webhook using the included helper:

```bash
node scripts/send-test-webhook.mjs <secret> https://pc-notifier.<your-subdomain>.workers.dev
```

Or run the test suite:

```bash
npm test
```

## Configuration

| Variable | Type | Description | Where to set it |
|---|---|---|---|
| `NOTIFY_TO` | secret | Recipient email address | `wrangler secret put NOTIFY_TO` |
| `NOTIFY_FROM` | var | Sender email (must be on a Resend-verified domain) | `vars` in `wrangler.jsonc` |
| `NOTIFY_NAME` | var | Greeting name in email body | `vars` in `wrangler.jsonc` |
| `RESEND_API_KEY` | secret | Resend API key | `wrangler secret put RESEND_API_KEY` |
| `PCO_WEBHOOK_SECRET_CREATE` | secret | HMAC signature secret for `created` events | `wrangler secret put PCO_WEBHOOK_SECRET_CREATE` |
| `PCO_WEBHOOK_SECRET_UPDATE` | secret | HMAC signature secret for `updated` events | `wrangler secret put PCO_WEBHOOK_SECRET_UPDATE` |

**A name is either a var or a secret, never both.** Cloudflare returns error `10053` if you try to `wrangler secret put` a name already declared in `vars`. To convert a var into a secret, remove it from `wrangler.jsonc`, run `npx wrangler deploy` to release the binding, then run `wrangler secret put`.

Values in the `vars` block are public since the repo is open — never put a personal address or key there.

## Project Structure

```
planning-center-webhook-receiver/
├── .gitignore
├── .prettierrc
├── .editorconfig
├── AGENTS.md
├── README.md
├── worker-configuration.d.ts   # Generated TypeScript types
├── package.json
├── tsconfig.json
├── vitest.config.mts           # Vitest config + test-only secret bindings
├── src/
│   └── index.ts              # All Worker logic
├── scripts/
│   └── send-test-webhook.mjs # Node script to sign & POST test webhooks
├── .dev.vars                 # Local secrets (never commit — gitignored)
├── .dev.vars.example         # Example vars (committed)
└── wrangler.jsonc            # Cloudflare Worker config
```

## Local Development

```bash
npm run dev
```

This starts a local dev server at `http://localhost:8787`. The test webhook script can target this URL:

```bash
node scripts/send-test-webhook.mjs <secret> http://localhost:8787
```

## Debugging

Stream live logs from your deployed Worker:

```bash
npx wrangler tail
```

## Testing

The test suite includes three cases:

1. **GET returns 404** — the worker only accepts `POST`
2. **POST with bad signature returns 401** — HMAC verification fails
3. **POST with valid HMAC signature returns 200** — event is routed to the Durable Object

Run tests:

```bash
npm test
```

The tests exercise the real signature-verification path — nothing is stubbed out. The HMAC secrets the tests sign with are bound in `vitest.config.mts` under `poolOptions.workers.miniflare.bindings`, because they are secrets in production and therefore absent from `wrangler.jsonc`. Without those bindings the worker hashes the string `"undefined"` and every request 401s.

## Cost

- **Workers Free tier**: 100k requests/day — this project stays well within limits
- **Resend Free tier**: 3,000 emails/month
- **SQLite-backed Durable Objects** are available on the Workers Free plan (since April 2025). This project uses `new_sqlite_classes`, so **no paid plan is required**.
- **Durable Object write limit**: 100k rows written per day. Each `setAlarm()` counts as one row write. With a 30-second debounce, even high-volume plans stay comfortably under this limit.

## Setup Order at a Glance

The order matters: the Worker must exist before `wrangler secret put` can target it, and Planning Center only shows you a webhook secret after you give it a live URL.

1. `git clone` → `cd` → `npm install`
2. `npx wrangler login`
3. Set `NOTIFY_FROM` / `NOTIFY_NAME` in `wrangler.jsonc`
4. `npx wrangler secret put NOTIFY_TO` and `npx wrangler secret put RESEND_API_KEY`
5. `npx wrangler deploy` → note the returned `https://pc-notifier.<subdomain>.workers.dev` URL
6. Create the two Planning Center subscriptions (`plan_item.created`, `plan_item.updated`) pointing at that URL; copy the secret PCO shows for each
7. `npx wrangler secret put PCO_WEBHOOK_SECRET_CREATE` and `..._UPDATE`
8. **Done** — secrets take effect immediately, no redeploy needed

Local development (`\.dev.vars` + `npm run dev` + the test script) belongs in its own section *after* the deploy path, not interleaved with it.
