import { extractMarkdown, fetchFastHtml, fetchHtml, type PageRequest, type WorkerCtx } from './page';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const fetcher = request.fast === false ? fetchHtml : fetchFastHtml;
	const backupFetcher = request.fast === false ? fetchFastHtml : fetchHtml;
	let page;
	try {
		page = await fetcher(worker, request);
	} catch {
		page = await backupFetcher(worker, request);
	}
	const { html, finalUrl, contentType } = page;
	return extractMarkdown(html, finalUrl, contentType, worker.env);
}
