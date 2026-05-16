import { extractMarkdown, extractScreenshot, withVisualContext, type PageRequest, type WorkerCtx } from './page';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: PageRequest): Promise<Snapshot> {
	return withVisualContext(worker, async (context) => {
		const page = await context.newPage();
		await page.goto(request.url, { waitUntil: request.waitUntil ?? 'networkidle', timeout: 15000 }).catch(() => {});
		const [markdown, png] = await Promise.all([extractMarkdown(page, request.url, worker.env), extractScreenshot(page)]);
		return { markdown, png };
	});
}
