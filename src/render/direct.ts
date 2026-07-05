import type { FetchedHtml } from '../types';

const BROWSER_HEADERS = {
	'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'accept-language': 'en-US,en;q=0.9',
};

/** A single direct fetch resolved to either HTML to extract or already-converted markdown. */
export type DirectFetch = { kind: 'html'; page: FetchedHtml } | { kind: 'markdown'; markdown: string };

function isHtml(contentType: string | null): boolean {
	return !contentType || contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml');
}

async function directFetch(url: string): Promise<Response> {
	const response = await fetch(url, { headers: BROWSER_HEADERS });
	if (!response.ok) {
		response.body?.cancel().catch(() => {});
		throw new Error(`Direct fetch failed (${response.status}) for ${url}`);
	}
	return response;
}

async function documentToMarkdown(env: Env, url: string, contentType: string | null, response: Response): Promise<string | null> {
	const buffer = await response.arrayBuffer();
	const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
	const result = await env.AI.toMarkdown({
		name,
		blob: new Blob([buffer], { type: contentType ?? 'application/octet-stream' }),
	});
	return result.format === 'markdown' ? result.data : null;
}

/** Single direct fetch that handles both HTML pages and documents (PDFs, etc.) without spinning up a browser. */
export async function fetchPageDirect(env: Env, url: string): Promise<DirectFetch> {
	const response = await directFetch(url);
	const contentType = response.headers.get('content-type');
	if (isHtml(contentType)) {
		return { kind: 'html', page: { html: await response.text(), finalUrl: response.url || url } };
	}
	const markdown = await documentToMarkdown(env, url, contentType, response);
	if (!markdown) throw new Error(`Could not convert ${contentType} content for ${url}`);
	return { kind: 'markdown', markdown };
}

/**
 * Speculative document grab raced against Browser Rendering. Resolves null when the URL is
 * unreachable or serves HTML (the browser's job); conversion errors still throw so the race
 * can report them.
 */
export async function fetchDocumentDirect(env: Env, url: string): Promise<string | null> {
	const response = await directFetch(url).catch(() => null);
	if (!response) return null;
	const contentType = response.headers.get('content-type');
	if (isHtml(contentType)) {
		response.body?.cancel().catch(() => {});
		return null;
	}
	return documentToMarkdown(env, url, contentType, response);
}
