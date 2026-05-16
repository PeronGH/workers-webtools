import { launch } from '@cloudflare/playwright';

type Browser = Awaited<ReturnType<typeof launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;
type GotoResponse = Awaited<ReturnType<Page['goto']>>;

export type RenderedPage = { page: Page; response: GotoResponse };

/**
 * Open a browser, navigate to `url` with lazy-load mitigations applied
 * (IntersectionObserver stub, eager <img>), then run `action` on the
 * resulting page. Closes the browser on the way out either way.
 */
export async function withRenderedPage<T>(url: string, env: Env, action: (rendered: RenderedPage) => Promise<T>): Promise<T> {
	const browser = await launch(env.BROWSER);
	try {
		const page = await browser.newPage();
		await page.setViewportSize({ width: 1440, height: 900 });

		// Treat every observed element as immediately visible so observer-driven
		// lazy loaders trigger their fetches during initial render.
		await page.addInitScript(() => {
			class EagerIO {
				private cb: (entries: unknown[]) => void;
				constructor(cb: (entries: unknown[]) => void) {
					this.cb = cb;
				}
				observe(el: Element) {
					queueMicrotask(() => this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }]));
				}
				unobserve() {}
				disconnect() {}
				takeRecords() {
					return [];
				}
			}
			(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = EagerIO;
		});

		let response: GotoResponse = null;
		try {
			response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: use whatever rendered.
		}

		// Flip native lazy <img loading="lazy"> to eager; the IO stub doesn't cover them.
		await page.evaluate(() => {
			const doc = (globalThis as unknown as { document: { querySelectorAll(s: string): Iterable<Element> } }).document;
			for (const img of doc.querySelectorAll('img[loading="lazy"]')) {
				img.setAttribute('loading', 'eager');
			}
		});

		await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

		return await action({ page, response });
	} finally {
		await browser.close();
	}
}

/**
 * Pull Markdown from an already-rendered page. Handles content-type branching:
 * HTML / text-ish → AI.toMarkdown, binary → refusal string.
 */
export async function extractMarkdown({ page, response }: RenderedPage, url: string, env: Env): Promise<string> {
	const contentType = response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase();
	const isConvertible =
		contentType === undefined ||
		contentType.startsWith('text/') ||
		contentType === 'application/xhtml+xml' ||
		contentType === 'application/json' ||
		contentType === 'application/xml';
	if (!isConvertible) {
		return `Cannot convert ${contentType} resource to Markdown. Source: ${url}`;
	}
	const html = await page.content();
	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([html], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: new URL(url).origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${(result as { error?: string }).error ?? 'unknown error'}`);
	}
	return result.data;
}

/** Take a full-page PNG of an already-rendered page. */
export async function extractScreenshot({ page }: RenderedPage): Promise<Uint8Array> {
	return page.screenshot({ fullPage: true, type: 'png' });
}
