export interface Env {
	RESEND_API_KEY: string;
	PCO_WEBHOOK_SECRET_CREATE: string;
	PCO_WEBHOOK_SECRET_UPDATE: string;
}

interface PlanItem {
	type: string;
	attributes: {
		title: string;
		item_type: string;
		song_id?: string;
		service_position?: string;
		length?: number;
		action?: string;
	};
}

interface OuterAttributes {
	name: string;
	attempt: number;
	payload: string;
}

interface PCOPayload {
	data: {
		id: string;
		type: string;
		attributes: OuterAttributes;
	}[];
}

async function verifySignature(request: Request, secret: string): Promise<{ valid: boolean; body: string }> {
	const body = await request.text();
	const signature = request.headers.get('X-PCO-Webhooks-Authenticity');

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

	const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	const digest = Array.from(new Uint8Array(signatureBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return { valid: digest === signature, body };
}

function formatEmail(songs: PlanItem[], action: string): { subject: string; emailTemplate: string } {
	const verb = action === 'updated' ? 'updated in' : 'added to';
	const songList = songs.map((s, i) => `  ${i + 1}. ${s.attributes.title}`).join('\n');

	const subject = `Planning Center Notification: ${songs.length} song${songs.length > 1 ? 's' : ''} ${verb} your plan`;

	const emailTemplate = `
	<h2>>Hey Vinnie Boi!</h2>
	
	<p>The following song${songs.length > 1 ? 's have' : ' has'} been ${verb} your Planning Center plan:</p>
	
	<ol>${songList}</ol>
	
	<p>View your plan at: <a href="https://services.planningcenteronline.com/schedule">Planning Center Online</a></p>
	
	<p>—Planning Center Notifier</p>
	`.trim();

	return { subject, emailTemplate };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Not found', { status: 404 });
		}

		const { valid: validCreated, body } = await verifySignature(request.clone(), env.PCO_WEBHOOK_SECRET_CREATE);
		const { valid: validUpdated, body: body2 } = await verifySignature(request, env.PCO_WEBHOOK_SECRET_UPDATE);

		if (!validCreated && !validUpdated) {
			return new Response('Unauthorized', { status: 401 });
		}

		const finalBody = validCreated ? body : body2;
		const outer: PCOPayload = JSON.parse(finalBody);

		const innerPayload = JSON.parse(outer.data[0].attributes.payload ?? '{}');
		const item = innerPayload.data;

		const songs = item && item.attributes.item_type === 'song' ? [item] : [];

		if (songs.length === 0) {
			return new Response('OK', { status: 200 });
		}

		const action = outer.data[0]?.attributes?.name?.includes('updated') ? 'updated' : 'created';
		const { subject, emailTemplate } = formatEmail(songs, action);

		const resendResponse = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: 'onboarding@resend.dev',
				to: 'vkscoma@gmail.com',
				subject,
				html: emailTemplate,
			}),
		});

		const _resendData = await resendResponse.json();
		//console.log('Resend response:', JSON.stringify(_resendData));

		return new Response('OK', { status: 200 });
	},
};
