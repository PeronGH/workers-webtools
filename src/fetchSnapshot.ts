import { extractMarkdown, fetchSnapshotData, type PageRequest, type WorkerCtx } from './page';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: PageRequest): Promise<Snapshot> {
	const { html, png, finalUrl, contentType } = await fetchSnapshotData(worker, request);
	const markdown = await extractMarkdown(html, finalUrl, contentType, worker.env);
	return { markdown, png };
}
