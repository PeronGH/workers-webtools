import { extractPage } from '../extract/defuddle';
import { isGarbageOutput } from '../extract/garbage';
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
		const { defuddle } = await extractPage(page);
		return toMarkdown(page, defuddle, worker.env);
	}

	const page = first.result;
	const { document, defuddle } = await extractPage(page);
	if (!isGarbageOutput(document) && defuddle.wordCount > 0) {
		return toMarkdown(page, defuddle, worker.env);
	}
	const direct = await directPromise;
	if (direct) return direct;
	return toMarkdown(page, defuddle, worker.env);
}

async function fetchPage(worker: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	if (request.fast === false) return fetchHtml(worker, request);
	try {
		return await fetchFastHtml(worker, request);
	} catch {
		return fetchHtml(worker, request);
	}
}
