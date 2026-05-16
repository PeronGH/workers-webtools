import { launch } from '@cloudflare/playwright';

type Browser = Awaited<ReturnType<typeof launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
type Page = Awaited<ReturnType<BrowserContext['newPage']>>;
type GotoOptions = NonNullable<Parameters<Page['goto']>[1]>;

/** Worker-runtime context. When `ctx` is provided, browser.close() is detached
 *  via ctx.waitUntil so the caller returns as soon as the action's result is ready. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext };

/** Per-call rendering options. */
export type PageRequest = { url: string; waitUntil?: GotoOptions['waitUntil'] };

/** 1x1 transparent PNG, fulfilled in place of blocked images so onload/onerror
 *  handlers fire normally. */
const TRANSPARENT_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==',
	'base64',
);

/** Strip `navigator.webdriver`. Context init scripts run before any page script
 *  on every navigation in every frame inside the context, so this is applied
 *  consistently across multi-redirect chains. */
function stealth(): void {
	const nav = (globalThis as unknown as { navigator: object }).navigator;
	delete (Object.getPrototypeOf(nav) as Record<string, unknown>).webdriver;
}

/** Make lazy-loaded media load eagerly: stub IntersectionObserver and rewrite
 *  `<img loading="lazy">` to eager as nodes are inserted. The MutationObserver
 *  is per-document, so it re-arms on every navigation. */
function eagerLazy(): void {
	type DomNode = { nodeType: number };
	type DomElement = DomNode & {
		tagName: string;
		getAttribute(name: string): string | null;
		setAttribute(name: string, value: string): void;
		querySelectorAll(selector: string): Iterable<DomElement>;
	};
	type Mutation = { addedNodes: Iterable<DomNode> };
	type MutationObserverCtor = new (cb: (muts: Iterable<Mutation>) => void) => {
		observe(target: unknown, opts: { childList: boolean; subtree: boolean }): void;
	};
	const win = globalThis as unknown as {
		IntersectionObserver: unknown;
		MutationObserver: MutationObserverCtor;
		document: unknown;
	};

	class EagerIO {
		private cb: (entries: unknown[]) => void;
		constructor(cb: (entries: unknown[]) => void) {
			this.cb = cb;
		}
		observe(el: unknown) {
			queueMicrotask(() => this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }]));
		}
		unobserve() {}
		disconnect() {}
		takeRecords() {
			return [];
		}
	}
	win.IntersectionObserver = EagerIO;

	const flip = (el: DomElement): void => {
		if (el.tagName === 'IMG' && el.getAttribute('loading') === 'lazy') {
			el.setAttribute('loading', 'eager');
		}
	};
	new win.MutationObserver((muts) => {
		for (const mut of muts) {
			for (const node of mut.addedNodes) {
				if (node.nodeType !== 1) continue;
				const el = node as DomElement;
				flip(el);
				for (const img of el.querySelectorAll('img[loading="lazy"]')) flip(img);
			}
		}
	}).observe(win.document, { childList: true, subtree: true });
}

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
 * Text-extraction context: stealth + a route handler that serves a 1x1 PNG for
 * image requests and aborts media/font. networkidle arrives much sooner and
 * onload-based gating on the page still fires.
 */
export async function withTextContext<T>(worker: WorkerCtx, action: (context: BrowserContext) => Promise<T>): Promise<T> {
	return withBrowser(worker, async (browser) => {
		const context = await browser.newContext();
		await context.addInitScript(stealth);
		await context.route('**/*', async (route) => {
			const type = route.request().resourceType();
			if (type === 'image') {
				await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
			} else if (type === 'media' || type === 'font') {
				await route.abort();
			} else {
				await route.continue();
			}
		});
		return action(context);
	});
}

/**
 * Visual-capture context: 1440x900 viewport + stealth + eager-lazy. The
 * MutationObserver re-arms per navigation, so lazy media starts loading
 * immediately on every redirected page too.
 */
export async function withVisualContext<T>(worker: WorkerCtx, action: (context: BrowserContext) => Promise<T>): Promise<T> {
	return withBrowser(worker, async (browser) => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await context.addInitScript(stealth);
		await context.addInitScript(eagerLazy);
		return action(context);
	});
}

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

/** Full-page PNG of a settled page. */
export async function extractScreenshot(page: Page): Promise<Uint8Array> {
	return page.screenshot({ fullPage: true, type: 'png' });
}
