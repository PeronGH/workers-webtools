import { withTextContext, type WorkerCtx } from './page';

export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
};

export async function search(query: string, worker: WorkerCtx): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		source: 'web',
		safesearch: 'off',
		search_lang: 'en',
	});
	const url = `https://search.brave.com/search?${params}`;

	return withTextContext(worker, async (context) => {
		const page = await context.newPage();
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
		return page.$$eval('div.snippet[data-type="web"]', (items) =>
			items.map((item) => ({
				title: item.querySelector('.search-snippet-title')?.textContent?.trim() ?? '',
				url: item.querySelector('a.l1')?.getAttribute('href') ?? '',
				snippet: item.querySelector('.generic-snippet .content')?.textContent?.trim() ?? '',
			})),
		);
	});
}
