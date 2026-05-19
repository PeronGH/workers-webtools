import { fetchSnapshotData } from '../render/container';
import type { PageRequest, WorkerCtx } from '../types';

export async function fetchScreenshot(worker: WorkerCtx, request: PageRequest): Promise<Uint8Array> {
	const { png } = await fetchSnapshotData(worker, request);
	return png;
}
