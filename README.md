# Planning Center Notifier

A lightweight serverless webhook listener that sends you an email whenever songs are added or updated in your Planning Center Services plan.

## How It Works

```
Planning Center event
  → POST /webhook (with X-PCO-Webhook-Secret header)
    → Verify HMAC signature
      → Filter for song items
        → Resend API → Your inbox
```

## Stack

- **[Cloudflare Workers](https://workers.cloudflare.com)** — serverless hosting, free tier (100k requests/day)
- **[Resend](https://resend.com)** — email delivery, free tier (3,000 emails/month)
- **[Planning Center](https://api.planningcenteronline.com/webhooks)** — webhook source

## Prerequisites

- [Node.js](https://nodejs.org) installed
- A [Cloudflare](https://cloudflare.com) account
- A [Resend](https://resend.com) account
- Access to Planning Center

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set your secrets

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PCO_WEBHOOK_SECRET_CREATE
npx wrangler secret put PCO_WEBHOOK_SECRET_UPDATE
```

### 3. Set up local development variables

Create a `.dev.vars` file in the root of the project (never commit this!):

```
RESEND_API_KEY=your_resend_api_key
PCO_WEBHOOK_SECRET_CREATE=your_pco_create_secret
PCO_WEBHOOK_SECRET_UPDATE=your_pco_update_secret
```

### 4. Deploy

```bash
npx wrangler deploy
```

Your Worker will be live at:
```
https://pc-notifier.<your-subdomain>.workers.dev
```

### 5. Set up Planning Center Webhook

1. Go to [api.planningcenteronline.com/webhooks](https://api.planningcenteronline.com/webhooks)
2. Click **"Add a new subscription URL"**
3. Paste your Worker URL
4. Subscribe to the following events:
   - `services.v2.events.plan_item.created`
   - `services.v2.events.plan_item.updated`
5. Copy the secret for each event and store them using the `wrangler secret put` commands above

## Project Structure

```
pc-notifier/
├── src/
│   └── index.ts       # All Worker logic
├── .dev.vars          # Local secrets (never commit!)
├── .gitignore
├── package.json
├── tsconfig.json
└── wrangler.toml      # Cloudflare Worker config
```

## Local Development

```bash
npm run dev
```

## Debugging

Stream live logs from your deployed Worker:

```bash
npx wrangler tail
```

## Testing

Temporarily comment out the signature verification in `src/index.ts` and fire a test curl request:

```bash
curl -X POST https://pc-notifier.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "type": "PlanItem",
      "attributes": {
        "title": "Way Maker",
        "item_type": "song",
        "action": "created"
      }
    }]
  }'
```

Remember to uncomment the signature verification and redeploy before going live!
