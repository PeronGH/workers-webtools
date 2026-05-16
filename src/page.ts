import { launch } from '@cloudflare/playwright';

type Browser = Awaited<ReturnType<typeof launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;
type GotoResponse = Awaited<ReturnType<Page['goto']>>;
type GotoOptions = NonNullable<Parameters<Page['goto']>[1]>;

export type RenderedPage = { page: Page; response: GotoResponse };

/** Worker-runtime context. When `ctx` is provided, browser.close() is
 *  detached via ctx.waitUntil so the caller returns as soon as the
 *  action's result is ready. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext };

/** Per-call rendering options. */
export type PageRequest = { url: string; waitUntil?: GotoOptions['waitUntil'] };

async function withBrowser<T>({ env, ctx }: WorkerCtx, action: (browser: Browser) => Promise<T>): Promise<T> {
	const browser = await launch(env.BROWSER);
	try {
		return await action(browser);
	} finally {
		if (ctx) ctx.waitUntil(browser.close());
		else await browser.close();
	}
}

/**
 * Minimal browser path: launch, navigate, run action. Used by Markdown
 * extraction and search scraping where we just need the rendered DOM.
 */
export async function withRenderedPage<T>(
	worker: WorkerCtx,
	request: PageRequest,
	action: (rendered: RenderedPage) => Promise<T>,
): Promise<T> {
	return withBrowser(worker, async (browser) => {
		const page = await browser.newPage();
		await hideWebdriverFlag(page);
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
			await page.goto(request.url, { waitUntil: request.waitUntil ?? 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: use whatever rendered.
		}
		return action({ page, response });
	});
}

/** Strip `navigator.webdriver` so the page doesn't trivially detect automation. */
async function hideWebdriverFlag(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const nav = (globalThis as unknown as { navigator: object }).navigator;
		delete (Object.getPrototypeOf(nav) as Record<string, unknown>).webdriver;
	});
}

/**
 * Visual-rendering path: 1440x900 viewport + IntersectionObserver stub +
 * native lazy <img> eager flip + extra networkidle wait. Used by
 * screenshot/snapshot where we need lazy media to actually load.
 */
export async function withVisualPage<T>(
	worker: WorkerCtx,
	request: PageRequest,
	action: (rendered: RenderedPage) => Promise<T>,
): Promise<T> {
	return withBrowser(worker, async (browser) => {
		const page = await browser.newPage();
		await hideWebdriverFlag(page);
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
			await page.goto(request.url, { waitUntil: request.waitUntil ?? 'networkidle', timeout: 15000 });
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
