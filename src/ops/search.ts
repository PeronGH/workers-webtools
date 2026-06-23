import { parseHTML } from 'linkedom';
import { stealthFetchHtml } from '../render/container';
import { fetchHtmlDirect } from '../render/direct';
import type { WorkerCtx } from '../types';

export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
};

/** Structural type for the linkedom nodes we touch. */
type SearchEl = {
	querySelector(selector: string): {
		textContent: string | null;
		getAttribute(name: string): string | null;
	} | null;
};

export async function search(worker: WorkerCtx, query: string): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		source: 'web',
		safesearch: 'off',
		summary: '0',
	});
	const url = `https://search.brave.com/search?${params}`;

	// Brave serves a bot challenge to plain fetches; fall back to the stealth browser when that happens.
	const { html } = await fetchHtmlDirect(url).catch(() => stealthFetchHtml(worker, { url, waitUntil: 'domcontentloaded' }));
	const { document } = parseHTML(html);
	return Array.from(document.querySelectorAll('div.snippet[data-type="web"]'), (raw) => {
		const item = raw as SearchEl;
		return {
			title: item.querySelector('.search-snippet-title')?.textContent?.trim() ?? '',
			url: item.querySelector('a.l1')?.getAttribute('href') ?? '',
			snippet: item.querySelector('.generic-snippet')?.textContent?.trim() ?? '',
		};
	});
}
