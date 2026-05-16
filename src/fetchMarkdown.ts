import { launch } from '@cloudflare/playwright';

export async function fetchMarkdown(url: string, env: Env): Promise<string> {
	const browser = await launch(env.BROWSER);
	let html: string;
	try {
		const page = await browser.newPage();
		try {
			await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: return whatever rendered by the timeout.
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
		throw new Error(`HTML→Markdown conversion failed: ${(result as { error?: string }).error ?? 'unknown error'}`);
	}
	return result.data;
}
