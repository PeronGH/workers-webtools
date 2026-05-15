import Cloudflare from 'cloudflare';

export async function fetchScreenshot(url: string, env: Env): Promise<ArrayBuffer> {
	const client = new Cloudflare({ apiToken: env.CLOUDFLARE_API_TOKEN });
	const response = await client.browserRendering.screenshot
		.create({
			account_id: env.CLOUDFLARE_ACCOUNT_ID,
			url,
			gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
			bestAttempt: true,
		})
		.asResponse();
	return response.arrayBuffer();
}
