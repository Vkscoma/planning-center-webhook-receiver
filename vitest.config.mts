import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				// Test-only values. The worker reads these as secrets in production,
				// so they are absent from wrangler.jsonc and must be bound here or
				// signature verification hashes the string "undefined" and every
				// request 401s.
				miniflare: {
					bindings: {
						PCO_WEBHOOK_SECRET_CREATE: 'test-secret-key',
						PCO_WEBHOOK_SECRET_UPDATE: 'test-secret-key-update',
						RESEND_API_KEY: 're_test_key',
					},
				},
			},
		},
	},
});
