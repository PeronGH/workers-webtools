import { TIMEOUT, type Page } from './browser';
import { htmlToMarkdown } from './htmlToMarkdown';

const PAGE_IS_NAVIGATING = /page is navigating/i;

/**
 * Pull Markdown from a settled page. Reads `document.contentType` from the
 * current document so the right branch is picked regardless of how many
 * redirects (HTTP, meta-refresh, JS) the page went through.
 */
export async function extractMarkdown(page: Page, url: string): Promise<string> {
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
	return htmlToMarkdown(html, url);
}

/** Full-page PNG of a settled page. */
export async function extractScreenshot(page: Page): Promise<Uint8Array> {
	return page.screenshot({ fullPage: true, type: 'png' });
}
