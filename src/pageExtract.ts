import type { Page } from './browser';

const PAGE_IS_NAVIGATING = /page is navigating/i;

/**
 * Pull Markdown from a settled page. Reads `document.contentType` from the
 * current document so the right branch is picked regardless of how many
 * redirects (HTTP, meta-refresh, JS) the page went through.
 */
export async function extractMarkdown(page: Page, url: string, env: Env): Promise<string> {
	const raw = await page.evaluate(() => (globalThis as unknown as { document: { contentType: string } }).document.contentType);
	const contentType = raw?.split(';')[0]?.trim().toLowerCase();
	const isConvertible =
		contentType === undefined ||
		contentType.startsWith('text/') ||
		contentType === 'application/xhtml+xml' ||
		contentType === 'application/json' ||
		contentType === 'application/xml';
	if (!isConvertible) {
		return `Cannot convert ${contentType} resource to Markdown. Source: ${url}`;
	}
	let html: string;
	for (;;) {
		try {
			html = await page.content();
			break;
		} catch (e) {
			if (!PAGE_IS_NAVIGATING.test(String(e))) throw e;
			await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
		}
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

/** Full-page PNG of a settled page. */
export async function extractScreenshot(page: Page): Promise<Uint8Array> {
	return page.screenshot({ fullPage: true, type: 'png' });
}
