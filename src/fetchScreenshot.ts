import { extractScreenshot, withVisualPage, type PageRequest, type WorkerCtx } from './page';

export async function fetchScreenshot(worker: WorkerCtx, request: PageRequest): Promise<Uint8Array> {
	return withVisualPage(worker, request, extractScreenshot);
}
