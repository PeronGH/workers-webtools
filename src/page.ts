import { launch } from '@cloudflare/playwright';

type Browser = Awaited<ReturnType<typeof launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;
type GotoResponse = Awaited<ReturnType<Page['goto']>>;

export type RenderedPage = { page: Page; response: GotoResponse };
type GotoOptions = NonNullable<Parameters<Page['goto']>[1]>;

async function withBrowser<T>(env: Env, action: (browser: Browser) => Promise<T>): Promise<T> {
	const browser = await launch(env.BROWSER);
	try {
		return await action(browser);
	} finally {
		await browser.close();
	}
}

/**
 * Minimal browser path: launch, navigate, run action. Used by Markdown
 * extraction where we just need the rendered DOM and don't care about
 * lazy-loaded media.
 */
export async function withRenderedPage<T>(
	url: string,
	env: Env,
	action: (rendered: RenderedPage) => Promise<T>,
	options?: { waitUntil?: GotoOptions['waitUntil'] },
): Promise<T> {
	return withBrowser(env, async (browser) => {
		const page = await browser.newPage();
		// Track the most recent main-frame navigation response so callers see
		// the response of the page they're actually reading, not the initial
		// goto's response if a redirect chain occurred.
		let response: GotoResponse = null;
		page.on('response', (res) => {
			if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) {
				response = res;
			}
		});
		try {
			await page.goto(url, { waitUntil: options?.waitUntil ?? 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: use whatever rendered.
		}
		return action({ page, response });
	});
}

/**
 * Visual-rendering path: 1440x900 viewport + IntersectionObserver stub +
 * native lazy <img> eager flip + extra networkidle wait. Used by
 * screenshot/snapshot where we need lazy media to actually load.
 */
export async function withVisualPage<T>(url: string, env: Env, action: (rendered: RenderedPage) => Promise<T>): Promise<T> {
	return withBrowser(env, async (browser) => {
		const page = await browser.newPage();
		await page.setViewportSize({ width: 1440, height: 900 });

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
		page.on('response', (res) => {
			if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) {
				response = res;
			}
		});
		try {
			await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
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

		await page.waitForLoadState('networkidle', { timeout: 10000 });

		return action({ page, response });
	});
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
	let html: string;
	try {
		html = await page.content();
	} catch (e) {
		// Some sites trigger a navigation right between networkidle and our
		// content read (Zhihu-style redirect chains). Wait for the new nav to
		// commit and try once more — if it still fails, the error propagates.
		if (!/page is navigating/i.test(String(e))) throw e;
		await page.waitForLoadState('networkidle', { timeout: 10000 });
		html = await page.content();
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

/** Take a full-page PNG of an already-rendered page. */
export async function extractScreenshot({ page }: RenderedPage): Promise<Uint8Array> {
	return page.screenshot({ fullPage: true, type: 'png' });
}
