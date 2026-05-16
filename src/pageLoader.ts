import { TIMEOUT, type Browser, type Page, type PageRequest } from './browser';

type GotoOptions = NonNullable<Parameters<Page['goto']>[1]>;

/** 1x1 transparent PNG, fulfilled in place of blocked images so onload/onerror
 *  handlers fire normally. */
const TRANSPARENT_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==',
	'base64',
);

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
type SiteGlobal = typeof globalThis & {
	document: unknown;
	navigator: object;
	IntersectionObserver: unknown;
	MutationObserver: MutationObserverCtor;
};

/** Strip `navigator.webdriver`. Context init scripts run before any page script
 *  on every navigation in every frame inside the context, so this is applied
 *  consistently across multi-redirect chains. */
function stealth(): void {
	const nav = (globalThis as SiteGlobal).navigator;
	delete (Object.getPrototypeOf(nav) as Record<string, unknown>).webdriver;
}

/** Make lazy-loaded media load eagerly: stub IntersectionObserver and rewrite
 *  `<img loading="lazy">` to eager as nodes are inserted. The MutationObserver
 *  is per-document, so it re-arms on every navigation. */
function eagerLazy(): void {
	const win = globalThis as SiteGlobal;

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

/**
 * Page loader shared by text extraction, search, and visual capture. Both modes
 * use the same viewport, stealth script, and navigation path.
 */
export async function loadPage(browser: Browser, request: PageRequest, mode: 'text' | 'visual'): Promise<Page> {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.addInitScript(stealth);
	if (mode === 'text') {
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
	} else {
		await context.addInitScript(eagerLazy);
	}
	const page = await context.newPage();
	const renderMode = request.renderMode ?? 'spa';
	await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }).catch(() => {});
	await page.waitForSelector('#anubis_challenge', { state: 'detached', timeout: TIMEOUT });
	if (renderMode !== 'ssr') await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
	return page;
}
