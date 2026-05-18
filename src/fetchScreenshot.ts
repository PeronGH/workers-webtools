import { fetchSnapshotData, type PageRequest, type WorkerCtx } from './page';

export async function fetchScreenshot(worker: WorkerCtx, request: PageRequest): Promise<Uint8Array> {
	const { png } = await fetchSnapshotData(worker, request);
	return png;
}
