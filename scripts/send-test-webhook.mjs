#!/usr/bin/env node
import { createHmac } from 'crypto';
import fetch from 'node:url';

const args = process.argv.slice(2);
if (args.length < 2) {
	console.error('Usage: node send-test-webhook.mjs <secret> <url>');
	process.exit(1);
}

const secret = args[0];
const url = args[1];

// Build the realistic PCO envelope
// attributes.payload is a JSON string (double-encoded)
const envelope = {
	data: [{
		id: '1',
		type: 'WebhookEvent',
		attributes: {
			name: 'services.v2.events.plan_item.created',
			attempt: 1,
			payload: JSON.stringify({
				data: {
					type: 'PlanItem',
					attributes: {
						title: 'Way Maker',
						item_type: 'song',
						key_name: 'G',
					},
					relationships: {
						plan: {
							data: {
								id: '123456',
							},
						},
					},
				},
			}),
		},
	}],
};

// Convert to string (this double-encodes the payload)
const body = JSON.stringify(envelope);

// Compute HMAC-SHA256 hex signature
const signature = createHmac('sha256', secret).update(body).digest('hex');

// POST with the authenticity header
fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-PCO-Webhooks-Authenticity': signature,
	},
	body,
}).then((res) => {
	console.log(`Response status: ${res.status}`);
	res.text().then((text) => {
		console.log('Response body:', text);
	});
}).catch((err) => {
	console.error('Error:', err);
});
