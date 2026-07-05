export type SearchResult = {
	title: string;
	url: string;
	snippet: string;
};

const SEARXNG_URL = 'https://search.banned.dynv6.net/search';

/** Fields we surface from a SearXNG JSON result. */
type SearxngResult = { title?: string; url?: string; content?: string };

export async function search(query: string): Promise<SearchResult[]> {
	const params = new URLSearchParams({ q: query, format: 'json', safesearch: '0' });
	const response = await fetch(`${SEARXNG_URL}?${params}`, { headers: { accept: 'application/json' } });
	if (!response.ok) {
		response.body?.cancel().catch(() => {});
		throw new Error(`SearXNG search failed (${response.status}) for ${query}`);
	}
	const { results } = (await response.json()) as { results?: SearxngResult[] };
	return (results ?? []).map((r) => ({
		title: r.title?.trim() ?? '',
		url: r.url ?? '',
		snippet: r.content?.trim() ?? '',
	}));
}
