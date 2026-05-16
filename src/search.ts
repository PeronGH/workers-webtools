import { launch } from '@cloudflare/playwright';

export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
};

export async function search(query: string, env: Env): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		source: 'web',
		safesearch: 'off',
		search_lang: 'en',
	});
	const url = `https://search.brave.com/search?${params}`;

	const browser = await launch(env.BROWSER);
	try {
		const p = await browser.newPage();
		await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
		return await p.$$eval('div.snippet[data-type="web"]', (items) =>
			items.map((item) => ({
				title: item.querySelector('.search-snippet-title')?.textContent?.trim() ?? '',
				url: item.querySelector('a.l1')?.getAttribute('href') ?? '',
				snippet: item.querySelector('.generic-snippet .content')?.textContent?.trim() ?? '',
			})),
		);
	} finally {
		await browser.close();
	}
}
