import { extractMarkdown, fetchHtml, type PageRequest, type WorkerCtx } from './page';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const { html, finalUrl, contentType } = await fetchHtml(worker, request);
	return extractMarkdown(html, finalUrl, contentType, worker.env);
}
