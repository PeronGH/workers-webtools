import { launch } from '@cloudflare/playwright';

export async function fetchScreenshot(url: string, env: Env): Promise<Uint8Array> {
	const browser = await launch(env.BROWSER);
	try {
		const page = await browser.newPage();
		await page.setViewportSize({ width: 1440, height: 900 });

		// Stub IntersectionObserver so lazy-load JS treats every observed element
		// as immediately visible — triggers all observer-driven image loads on
		// initial render without needing to scroll.
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

		try {
			await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: capture whatever rendered.
		}

		// Native <img loading="lazy"> isn't observer-driven; flip them to eager.
		await page.evaluate(() => {
			const doc = (globalThis as unknown as { document: { querySelectorAll(s: string): Iterable<Element> } }).document;
			for (const img of doc.querySelectorAll('img[loading="lazy"]')) {
				img.setAttribute('loading', 'eager');
			}
		});

		// Let the freshly-eager images fetch.
		await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

		return await page.screenshot({ fullPage: true, type: 'png' });
	} finally {
		await browser.close();
	}
}
