import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Planning Center Webhook Receiver', () => {
	it('responds with 404 on GET', async () => {
		const request = new Request('http://example.com', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toBe('Not found');
		expect(await response.status).toBe(404);
	});

	it('responds with 401 on POST with bad signature', async () => {
		const request = new Request('http://example.com', {
			method: 'POST',
			body: JSON.stringify({ data: [] }),
			headers: { 'Content-Type': 'application/json' },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(401);
	});

	it('responds with 200 on POST with valid HMAC signature over a PCO envelope', async () => {
		const secret = 'test-secret-key';

		// Build the realistic PCO envelope (double-encoded payload)
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
		const payload = JSON.stringify(envelope);

		// Compute HMAC-SHA256 signature using the Web Crypto API
		const encoder = new TextEncoder();
		const key = await globalThis.crypto.subtle.importKey(
			'raw',
			encoder.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const signatureBuffer = await globalThis.crypto.subtle.sign(
			'HMAC',
			key,
			encoder.encode(payload)
		);
		const signature = Array.from(new Uint8Array(signatureBuffer))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		const request = new Request('http://example.com', {
			method: 'POST',
			body: new Blob([payload]),
			headers: {
				'Content-Type': 'application/json',
				'X-PCO-Webhooks-Authenticity': signature,
			},
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(200);
	});
});
