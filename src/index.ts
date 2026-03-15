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
	relationships: {
		plan: {
			data: {
				id: string;
			};
		};
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

function formatEmail(songs: PlanItem[], planId: string, action: string): { subject: string; emailTemplate: string } {
	const verb = action === 'updated' ? 'updated in' : 'added to';
	const songList = songs.map((s) => `<li>${s.attributes.title}</li>`).join('');

	const subject = `Planning Center Notification: ${songs.length} song${songs.length > 1 ? 's' : ''} ${verb} your plan`;

	const emailTemplate = `
	<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <!--$-->
  </head>
  <body style="background-color:rgb(255,255,255)">
    <table
      border="0"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      align="center">
      <tbody>
        <tr>
          <td
            style="background-color:rgb(255,255,255);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen-Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif">
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="max-width:37.5em;margin-right:auto;margin-left:auto;padding-bottom:48px;padding-top:20px">
              <tbody>
                <tr style="width:100%">
                  <td>
                    <p
                      style="font-size:16px;line-height:26px;margin-top:16px;margin-bottom:16px">
                      Hi
                      <!-- -->Vincent<!-- -->,
                    </p>
                    <p
                      style="font-size:16px;line-height:26px;margin-top:16px;margin-bottom:16px">
                      The following song${songs.length > 1 ? 's have' : ' has'} been ${verb} your Planning Center plan:
                    </p>
					<ol>${songList}</ol>
                    <table
                      align="center"
                      width="100%"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="text-align:center">
                      <tbody>
                        <tr>
                          <td>
                            <a
                              href="https://services.planningcenteronline.com/plans/${planId}"
                              style="line-height:100%;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;background-color: #019AA5;border-radius:3px;color:rgb(255,255,255);font-size:16px;text-decoration-line:none;text-align:center;padding:12px;padding-top:12px;padding-right:12px;padding-bottom:12px;padding-left:12px"
                              target="_blank"
                              ><span
                                ><!--[if mso]><i style="mso-font-width:300%;mso-text-raise:18" hidden>&#8202;&#8202;</i><![endif]--></span
                              ><span
                                style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px"
                                >Go to Planning Center</span
                              ><span
                                ><!--[if mso]><i style="mso-font-width:300%" hidden>&#8202;&#8202;&#8203;</i><![endif]--></span
                              ></a
                            >
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p
                      style="font-size:16px;line-height:26px;margin-top:16px;margin-bottom:16px">
                      Best,<br />Planning Center Notifier
                    </p>
                    <hr
                      style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:rgb(204,204,204);margin-bottom:20px;margin-top:20px" />                
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
    <!--/$-->
  </body>
</html>
	`;

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
		const planId = item?.relationships?.plan?.data?.id ?? '';

		const songs = item && item.attributes.item_type === 'song' ? [item] : [];

		if (songs.length === 0) {
			return new Response('OK', { status: 200 });
		}

		const action = outer.data[0]?.attributes?.name?.includes('updated') ? 'updated' : 'created';
		const { subject, emailTemplate } = formatEmail(songs, planId, action);

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
