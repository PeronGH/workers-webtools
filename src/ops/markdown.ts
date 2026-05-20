import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { fetchHtml } from '../render/cloudflare';
import { stealthFetchHtml } from '../render/container';
import { fetchDirect } from '../render/direct';
import type { FetchOptions, FetchedHtml, PageRequest, WorkerCtx } from '../types';

type DirectResult =
	| { source: 'direct'; ok: true; markdown: string | null }
	| { source: 'direct'; ok: false; error: unknown };

type PageResult =
	| { source: 'page'; ok: true; page: FetchedHtml; defuddle: Awaited<ReturnType<typeof extractPage>> }
	| { source: 'page'; ok: false; error: unknown };

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const directPromise = fetchDirect(request.url, worker.env).then<DirectResult, DirectResult>(
		(markdown) => ({ source: 'direct', ok: true, markdown }),
		(error) => ({ source: 'direct', ok: false, error }),
	);
	const pagePromise = fetchPage(worker, request).then<PageResult, PageResult>(
		async (page) => ({ source: 'page', ok: true, page, defuddle: await extractPage(page) }),
		(error) => ({ source: 'page', ok: false, error }),
	);

	const first = await Promise.race([directPromise, pagePromise]);

	if (first.source === 'direct') {
		if (first.ok && first.markdown) return first.markdown;
		const page = await pagePromise;
		if (page.ok) return toMarkdown(page.page, page.defuddle, { env: worker.env, full: request.full });
		throwMarkdownError(page.error, first.ok ? undefined : first.error);
	}

	if (first.ok) {
		if (first.defuddle.wordCount > 0) {
			return toMarkdown(first.page, first.defuddle, { env: worker.env, full: request.full });
		}
		const direct = await directPromise;
		if (direct.ok && direct.markdown) return direct.markdown;
		return toMarkdown(first.page, first.defuddle, { env: worker.env, full: request.full });
	}

	const direct = await directPromise;
	if (direct.ok && direct.markdown) return direct.markdown;
	throwMarkdownError(first.error, direct.ok ? undefined : direct.error);
}

async function fetchPage(worker: WorkerCtx, request: FetchOptions): Promise<FetchedHtml> {
	if (request.stealth) return stealthFetchHtml(worker, request);
	try {
		return await fetchHtml(worker, request);
	} catch {
		return stealthFetchHtml(worker, request);
	}
}

function throwMarkdownError(primary: unknown, secondary: unknown | undefined): never {
	if (secondary) throw new AggregateError([primary, secondary], 'Failed to fetch Markdown.');
	throw primary;
}
