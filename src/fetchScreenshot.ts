import { extractScreenshot, loadPage, withBrowser, type PageRequest, type WorkerCtx } from './page';

export async function fetchScreenshot(worker: WorkerCtx, request: PageRequest): Promise<Uint8Array> {
	return withBrowser(worker, async (browser) => {
		const page = await loadPage(browser, request, 'visual');
		return extractScreenshot(page);
	});
}
