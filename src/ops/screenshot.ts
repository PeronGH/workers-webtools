import { stealthFetchSnapshot } from '../render/container';
import type { RenderOptions, WorkerCtx } from '../types';

export async function fetchScreenshot(worker: WorkerCtx, request: RenderOptions): Promise<Uint8Array> {
	const { png } = await stealthFetchSnapshot(worker, request);
	return png;
}
