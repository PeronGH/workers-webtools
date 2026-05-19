import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { fetchHtml } from '../render/container';
import { fetchFastHtml } from '../render/fast';
import type { PageRequest, WorkerCtx } from '../types';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const fetcher = request.fast === false ? fetchHtml : fetchFastHtml;
	const page = await fetcher(worker, request);
	const defuddle = await extractPage(page);
	return toMarkdown(page, defuddle, worker.env);
}
