import { launch } from '@cloudflare/playwright';

export async function fetchMarkdown(url: string, env: Env): Promise<string> {
	const browser = await launch(env.BROWSER);
	let html: string;
	let contentType: string | undefined;
	try {
		const page = await browser.newPage();
		let response: Awaited<ReturnType<typeof page.goto>> = null;
		try {
			response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: use whatever rendered by the timeout.
		}

		contentType = response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase();
		const isConvertible = contentType === undefined || contentType.startsWith('text/') || contentType === 'application/xhtml+xml';
		if (!isConvertible) {
			return `Cannot convert ${contentType} resource to Markdown. Source: ${url}`;
		}

		html = await page.content();
	} finally {
		await browser.close();
	}

	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([html], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: new URL(url).origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${(result as { error?: string }).error ?? 'unknown error'}`);
	}
	return result.data;
}
