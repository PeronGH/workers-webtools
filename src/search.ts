import { parseHTML } from 'linkedom';
import { fetchFastHtml, type WorkerCtx } from './page';

export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
};

// linkedom's NodeList iterates as `unknown`. We describe just the surface we
// touch and cast each item once with a single `as` from unknown.
type SearchEl = {
	querySelector(selector: string): {
		textContent: string | null;
		getAttribute(name: string): string | null;
	} | null;
};

export async function search(query: string, worker: WorkerCtx): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		source: 'web',
		safesearch: 'off',
		search_lang: 'en',
		country: 'ALL',
		summary: '0',
	});
	const url = `https://search.brave.com/search?${params}`;

	const { html } = await fetchFastHtml(worker, { url });
	const { document } = parseHTML(html);
	return Array.from(document.querySelectorAll('div.snippet[data-type="web"]'), (raw) => {
		const item = raw as SearchEl;
		return {
			title: item.querySelector('.search-snippet-title')?.textContent?.trim() ?? '',
			url: item.querySelector('a.l1')?.getAttribute('href') ?? '',
			snippet: item.querySelector('.generic-snippet .content')?.textContent?.trim() ?? '',
		};
	});
}
