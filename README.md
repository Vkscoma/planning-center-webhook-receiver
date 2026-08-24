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

Set the notification variables in `wrangler.jsonc` (placeholder values are committed — override with secrets at runtime):

```jsonc
"vars": {
	"NOTIFY_TO": "you@example.com",
	"NOTIFY_FROM": "onboarding@resend.dev",
	"NOTIFY_NAME": "there"
}
```

Set your Resend API key as a secret:

```bash
npx wrangler secret put RESEND_API_KEY
```

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

**Secrets take effect immediately** — no redeploy is needed after step 7.

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

| Variable | Type | Description | Overridden by |
|---|---|---|---|
| `NOTIFY_TO` | string | Recipient email address | `wrangler secret put NOTIFY_TO` |
| `NOTIFY_FROM` | string | Sender email (must be on a Resend-verified domain) | `wrangler secret put NOTIFY_FROM` |
| `NOTIFY_NAME` | string | Greeting name in email body | `wrangler secret put NOTIFY_NAME` |
| `RESEND_API_KEY` | string | Resend API key | `wrangler secret put RESEND_API_KEY` |
| `PCO_WEBHOOK_SECRET_CREATE` | string | HMAC signature secret for `created` events | `wrangler secret put PCO_WEBHOOK_SECRET_CREATE` |
| `PCO_WEBHOOK_SECRET_UPDATE` | string | HMAC signature secret for `updated` events | `wrangler secret put PCO_WEBHOOK_SECRET_UPDATE` |

**Secret override note**: Values in `wrangler.jsonc`'s `vars` block are public since the repo is open. At runtime, `wrangler secret put` secrets of the same name take precedence over `vars`.

## Project Structure

```
planning-center-webhook-receiver/
├── .github/                # GitHub workflows (if any)
├── .gitignore
├── .prettierrc
├── .editorconfig
├── AGENTS.md
├── README.md
├── worker-configuration.d.ts   # Generated TypeScript types
├── package.json
├── tsconfig.json
├── vitest.config.mts           # Vitest + Cloudflare Workers pool config
├── src/
│   ├── index.ts              # All Worker logic
│   └── testScript.mjs        # Local test script for wrangler dev
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

Previously, the suite was a failing "Hello World" template. It has been rewritten with real integration tests that exercise the full webhook pipeline.

**No more commenting out signature verification** — the tests validate correct behavior.

## Cost

- **Workers Free tier**: 100k requests/day — this project stays well within limits
- **Resend Free tier**: 3,000 emails/month
- **SQLite-backed Durable Objects** are available on the Workers Free plan (since April 2025). This project uses `new_sqlite_classes`, so **no paid plan is required**.
- **Durable Object write limit**: 100k rows written per day. Each `setAlarm()` counts as one row write. With a 30-second debounce, even high-volume plans stay comfortably under this limit.

## Correct Setup Order

The previous README was circular — step 2 asked for PCO secrets that step 5 hadn't generated yet, and `wrangler secret put` was run against a Worker that didn't exist yet. The correct order is:

1. `git clone` → `cd` → `npm install`
2. `npx wrangler login`
3. Set `NOTIFY_TO` / `NOTIFY_FROM` / `NOTIFY_NAME` in `wrangler.jsonc`
4. `npx wrangler secret put RESEND_API_KEY`
5. `npx wrangler deploy` → note the returned `https://pc-notifier.<subdomain>.workers.dev` URL
6. Create the two Planning Center subscriptions (`plan_item.created`, `plan_item.updated`) pointing at that URL; copy the secret PCO shows for each
7. `npx wrangler secret put PCO_WEBHOOK_SECRET_CREATE` and `..._UPDATE`
8. **Done** — secrets take effect immediately, no redeploy needed

Local development (`\.dev.vars` + `npm run dev` + the test script) belongs in its own section *after* the deploy path, not interleaved with it.
