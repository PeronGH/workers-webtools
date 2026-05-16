import { extractMarkdown, extractScreenshot, withVisualPage, type PageRequest, type WorkerCtx } from './page';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: PageRequest): Promise<Snapshot> {
	return withVisualPage(worker, request, async (rendered) => {
		const [markdown, png] = await Promise.all([extractMarkdown(rendered, request.url, worker.env), extractScreenshot(rendered)]);
		return { markdown, png };
	});
}
