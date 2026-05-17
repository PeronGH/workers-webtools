import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { TIMEOUT, type Page } from './browser';

const PAGE_IS_NAVIGATING = /page is navigating/i;

const DEFUDDLE_MATCHERS: Array<(url: URL) => boolean> = [() => true];

function shouldDefuddle(url: URL): boolean {
	return DEFUDDLE_MATCHERS.some((match) => match(url));
}

/**
 * Pull Markdown from a settled page. Reads `document.contentType` from the
 * current document so the right branch is picked regardless of how many
 * redirects (HTTP, meta-refresh, JS) the page went through.
 *
 * Defuddle does the content extraction (boilerplate removal, footnote
 * normalization). The HTML → Markdown step is handed off to env.AI.toMarkdown
 * because Defuddle's bundled turndown converter pulls in DOMParser, which
 * isn't available in the Workers runtime.
 */
export async function extractMarkdown(page: Page, env: Env): Promise<string> {
	let html: string;
	let url: string;
	for (;;) {
		try {
			const raw = await page.evaluate(() => (globalThis as unknown as { document: { contentType: string } }).document.contentType);
			const contentType = raw?.split(';')[0]?.trim().toLowerCase();
			url = page.url();
			const isConvertible =
				contentType === undefined ||
				contentType.startsWith('text/') ||
				contentType === 'application/xhtml+xml' ||
				contentType === 'application/json' ||
				contentType === 'application/xml' ||
				contentType.endsWith('+json') ||
				contentType.endsWith('+xml');
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
	const pageUrl = new URL(url);
	let contentHtml = html;
	const meta: Record<string, string | undefined> = { url };
	if (shouldDefuddle(pageUrl)) {
		const { document } = parseHTML(html);
		const extracted = await Defuddle(document, url, { includeReplies: true });
		contentHtml = extracted.content;
		meta.title = extracted.title;
		meta.description = extracted.description;
		meta.author = extracted.author;
		meta.site = extracted.site;
		meta.published = extracted.published;
		meta.image = extracted.image;
	}
	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([contentHtml], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: pageUrl.origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${result.error ?? 'unknown error'}`);
	}
	return buildFrontMatter(meta) + result.data;
}

function buildFrontMatter(fields: Record<string, string | undefined>): string {
	const entries = Object.entries(fields).filter(([, v]) => v && v.trim().length > 0);
	if (entries.length === 0) return '';
	const lines = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `---\n${lines.join('\n')}\n---\n\n`;
}

/** Full-page PNG of a settled page. */
export async function extractScreenshot(page: Page): Promise<Uint8Array> {
	return page.screenshot({ fullPage: true, type: 'png' });
}
