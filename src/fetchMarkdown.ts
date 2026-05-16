import { extractMarkdown, withRenderedPage, type PageRequest, type WorkerCtx } from './page';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	return withRenderedPage(worker, request, (rendered) => extractMarkdown(rendered, request.url, worker.env));
}
