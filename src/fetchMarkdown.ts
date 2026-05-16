import { extractMarkdown, loadPage, withBrowser, type PageRequest, type WorkerCtx } from './page';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	return withBrowser(worker, async (browser) => {
		const page = await loadPage(browser, request, 'text');
		return extractMarkdown(page, request.url, worker.env);
	});
}
