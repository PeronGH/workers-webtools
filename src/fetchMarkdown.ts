import Cloudflare from 'cloudflare';

export async function fetchMarkdown(url: string, env: Env): Promise<string> {
	const client = new Cloudflare({ apiToken: env.CLOUDFLARE_API_TOKEN });
	const markdown = await client.browserRendering.markdown.create({
		account_id: env.CLOUDFLARE_ACCOUNT_ID,
		url,
		gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
		bestAttempt: true,
	});
	// Browser Rendering resolves absolute paths against the page URL instead of the origin,
	// producing links like `<page-url>/<absolute-path>`. Rewrite those back to origin-rooted.
	const origin = new URL(url).origin;
	return markdown.replaceAll(`](${url}/`, `](${origin}/`);
}
