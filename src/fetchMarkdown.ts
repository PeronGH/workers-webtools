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

	const result = await env.AI.toMarkdown({
		name: 'page.html',
		blob: new Blob([html], { type: 'text/html' }),
	});
	if (result.format !== 'markdown') {
		throw new Error(`HTML→Markdown conversion failed: ${(result as { error?: string }).error ?? 'unknown error'}`);
	}

	// Some converters resolve absolute paths against the page URL instead of the
	// origin, producing links like `<page-url>/<absolute-path>`. Rewrite those.
	const origin = new URL(url).origin;
	return result.data.replaceAll(`](${url}/`, `](${origin}/`);
}
