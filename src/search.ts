import { launch } from '@cloudflare/playwright';

export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
};

export async function search(query: string, page: number, env: Env): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		page: String(page),
		language: 'english',
		segment: 'startpage.web',
	});
	const url = `https://www.startpage.com/do/search?${params}`;

	const browser = await launch(env.BROWSER);
	try {
		const p = await browser.newPage();
		await p.goto(url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
		const all = await p.$$eval('.result', (items) =>
			items.map((item) => ({
				title: item.querySelector('.wgl-title')?.textContent?.trim() ?? '',
				url: item.querySelector('a.result-link')?.getAttribute('href') ?? '',
				snippet: item.querySelector('.description')?.textContent?.trim() ?? '',
			})),
		);
		return all.filter((r) => r.title && r.url);
	} finally {
		await browser.close();
	}
}
