import { extractMarkdown, fetchFastHtml, fetchHtml, type PageRequest, type WorkerCtx } from './page';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const fetcher = request.fast === false ? fetchHtml : fetchFastHtml;
	const { html, finalUrl, contentType } = await fetcher(worker, request);
	return extractMarkdown(html, finalUrl, contentType, worker.env);
}
