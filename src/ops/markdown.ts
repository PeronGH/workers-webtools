import { extractPage } from '../extract/defuddle';
import { pageToMarkdown, toMarkdown } from '../extract/markdown';
import { fetchHtml } from '../render/cloudflare';
import { stealthFetchHtml } from '../render/container';
import { fetchDirect, fetchPageDirect } from '../render/direct';
import type { FetchOptions, FetchedHtml, PageRequest } from '../types';

/**
 * Outcome of one competitor in the direct-vs-browser race.
 * - `content`: confident markdown — the first competitor to produce one wins.
 * - `fallback`: the page rendered but Defuddle found no words; used only when nothing else succeeds.
 * - `none`: the direct probe saw HTML, so it has nothing to offer.
 */
type Rendered = { status: 'content' | 'fallback'; render: () => Promise<string> };
type Failed = { status: 'failed'; error: unknown };
type Attempt = Rendered | { status: 'none' } | Failed;

export async function fetchMarkdown(env: Env, request: PageRequest): Promise<string> {
	// A plain GET is enough when we only wait for DOMContentLoaded — one fetch, no browser.
	if (!request.stealth && request.waitUntil === 'domcontentloaded') {
		return fetchSimple(env, request);
	}

	// Race a speculative direct fetch (documents: PDFs etc.) against Browser Rendering (HTML pages),
	// so neither content type waits on the other's transport.
	const direct = directAttempt(env, request.url);
	const page = pageAttempt(env, request);

	const winner = await Promise.race([direct, page]);
	if (winner.status === 'content') return winner.render();

	// No confident winner: settle both, then prefer direct content over an empty page render.
	const [pageResult, directResult] = await Promise.all([page, direct]);
	if (directResult.status === 'content') return directResult.render();
	if (pageResult.status !== 'failed') return pageResult.render();

	if (directResult.status === 'failed') {
		throw new AggregateError([pageResult.error, directResult.error], 'Failed to fetch Markdown.');
	}
	throw pageResult.error;
}

async function directAttempt(env: Env, url: string): Promise<Attempt> {
	try {
		const markdown = await fetchDirect(url, env);
		if (!markdown) return { status: 'none' };
		return { status: 'content', render: async () => markdown };
	} catch (error) {
		return { status: 'failed', error };
	}
}

async function pageAttempt(env: Env, request: PageRequest): Promise<Rendered | Failed> {
	try {
		const page = await fetchPage(env, request);
		// Even in raw mode the extraction runs: wordCount decides the confidence tier.
		const defuddle = await extractPage(page);
		return {
			status: defuddle.wordCount > 0 ? 'content' : 'fallback',
			render: () => toMarkdown(env, page, request.raw ? null : defuddle),
		};
	} catch (error) {
		return { status: 'failed', error };
	}
}

async function fetchSimple(env: Env, request: PageRequest): Promise<string> {
	const result = await fetchPageDirect(request.url, env);
	if (result.kind === 'markdown') return result.markdown;
	return pageToMarkdown(env, result.page, request.raw);
}

async function fetchPage(env: Env, request: FetchOptions): Promise<FetchedHtml> {
	if (request.stealth) return stealthFetchHtml(env, request);
	return fetchHtml(env, request);
}
