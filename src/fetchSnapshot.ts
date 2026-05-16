import { extractMarkdown, extractScreenshot, loadPage, withBrowser, type PageRequest, type WorkerCtx } from './page';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: PageRequest): Promise<Snapshot> {
	return withBrowser(worker, async (browser) => {
		const page = await loadPage(browser, request, 'visual');
		const [markdown, png] = await Promise.all([extractMarkdown(page, request.url), extractScreenshot(page)]);
		return { markdown, png };
	});
}
