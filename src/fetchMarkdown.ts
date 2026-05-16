import { extractMarkdown, withTextContext, type PageRequest, type WorkerCtx } from './page';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	return withTextContext(worker, async (context) => {
		const page = await context.newPage();
		await page.goto(request.url, { waitUntil: request.waitUntil ?? 'networkidle', timeout: 15000 }).catch(() => {});
		return extractMarkdown(page, request.url, worker.env);
	});
}
