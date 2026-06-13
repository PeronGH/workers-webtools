import { parseHTML } from 'linkedom';

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

export async function search(query: string): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		source: 'web',
		safesearch: 'off',
		search_lang: 'en',
		country: 'ALL',
		summary: '0',
	});
	const url = `https://search.brave.com/search?${params}`;

	const response = await fetch(url, {
		headers: {
			'user-agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'accept-language': 'en-US,en;q=0.9',
		},
	});
	if (!response.ok) {
		throw new Error(`Brave search failed (${response.status}): ${await response.text()}`);
	}
	const html = await response.text();
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
