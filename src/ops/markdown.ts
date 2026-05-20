import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { fetchHtml } from '../render/container';
import { fetchDirect } from '../render/direct';
import { fetchFastHtml } from '../render/fast';
import type { FetchedHtml, PageRequest, WorkerCtx } from '../types';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const directPromise = fetchDirect(request.url, worker.env);
	const pagePromise = fetchPage(worker, request);
	directPromise.catch(() => {});
	pagePromise.catch(() => {});

	const first = await Promise.race([
		directPromise.then((result) => ({ src: 'direct' as const, result })),
		pagePromise.then((result) => ({ src: 'page' as const, result })),
	]);

	if (first.src === 'direct') {
		if (first.result) return first.result;
		const page = await pagePromise;
		const defuddle = await extractPage(page);
		return toMarkdown(page, defuddle, { env: worker.env, full: request.full });
	}

	const page = first.result;
	const defuddle = await extractPage(page);
	if (defuddle.wordCount > 0) {
		return toMarkdown(page, defuddle, { env: worker.env, full: request.full });
	}
	const direct = await directPromise;
	if (direct) return direct;
	return toMarkdown(page, defuddle, { env: worker.env, full: request.full });
}

async function fetchPage(worker: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	if (request.fast === false) return fetchHtml(worker, request);
	try {
		return await fetchFastHtml(worker, request);
	} catch {
		return fetchHtml(worker, request);
	}
}
