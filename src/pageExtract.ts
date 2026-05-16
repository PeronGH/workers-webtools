import { Readability } from '@mozilla/readability';
import JSDOMParser from '@mozilla/readability/JSDOMParser';
import { TIMEOUT, type Page } from './browser';

const PAGE_IS_NAVIGATING = /page is navigating/i;

function readableHtml(html: string, url: string): string {
	try {
		const doc = new JSDOMParser().parse(html, url) as ConstructorParameters<typeof Readability>[0];
		return new Readability(doc).parse()?.content ?? html;
	} catch {
		return html;
	}
}

/**
 * Pull Markdown from a settled page. Reads `document.contentType` from the
 * current document so the right branch is picked regardless of how many
 * redirects (HTTP, meta-refresh, JS) the page went through.
 */
export async function extractMarkdown(page: Page, url: string, env: Env): Promise<string> {
	let html: string;
	for (;;) {
		try {
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
			html = await page.content();
			break;
		} catch (e) {
			if (!PAGE_IS_NAVIGATING.test(String(e))) throw e;
			await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => {});
		}
	}
	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([readableHtml(html, url)], { type: 'text/html' }) },
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
