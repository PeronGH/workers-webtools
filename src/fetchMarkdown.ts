import Cloudflare from 'cloudflare';

export async function fetchMarkdown(url: string, env: Env): Promise<string> {
	const client = new Cloudflare({ apiToken: env.CLOUDFLARE_API_TOKEN });
	return client.browserRendering.markdown.create({
		account_id: env.CLOUDFLARE_ACCOUNT_ID,
		url,
		gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
		bestAttempt: true,
	});
}
