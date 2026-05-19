import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { fetchHtml } from '../render/container';
import { fetchFastHtml } from '../render/fast';
import type { FetchedHtml, PageRequest, WorkerCtx } from '../types';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const page = await fetchPage(worker, request);
	const defuddle = await extractPage(page);
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
