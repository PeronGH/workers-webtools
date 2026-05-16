import { launch } from '@cloudflare/playwright';

export async function fetchMarkdown(url: string, env: Env): Promise<string> {
	const browser = await launch(env.BROWSER);
	let outcome: string | { html: string };
	try {
		const page = await browser.newPage();
		let response: Awaited<ReturnType<typeof page.goto>> = null;
		try {
			response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: use whatever rendered.
		}

		const contentType = response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase();
		const isHtml = contentType === undefined || contentType === 'text/html' || contentType === 'application/xhtml+xml';
		const isOtherText = !isHtml && (contentType!.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml');

		if (isHtml) {
			outcome = { html: await page.content() };
		} else if (isOtherText) {
			// Browser wraps JSON/plain text in a viewer; read the raw response body instead.
			outcome = (await response?.text()) ?? '';
		} else {
			outcome = `Cannot convert ${contentType} resource to Markdown. Source: ${url}`;
		}
	} finally {
		await browser.close();
	}

	if (typeof outcome === 'string') return outcome;

	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([outcome.html], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: new URL(url).origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${(result as { error?: string }).error ?? 'unknown error'}`);
	}
	return result.data;
}
