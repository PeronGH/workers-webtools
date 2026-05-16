import { extractScreenshot, withVisualContext, type PageRequest, type WorkerCtx } from './page';

export async function fetchScreenshot(worker: WorkerCtx, request: PageRequest): Promise<Uint8Array> {
	return withVisualContext(worker, async (context) => {
		const page = await context.newPage();
		await page.goto(request.url, { waitUntil: request.waitUntil ?? 'networkidle', timeout: 15000 }).catch(() => {});
		return extractScreenshot(page);
	});
}
