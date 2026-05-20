import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { fetchSnapshotData } from '../render/container';
import type { PageRequest, WorkerCtx } from '../types';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: PageRequest): Promise<Snapshot> {
	const { png, ...page } = await fetchSnapshotData(worker, request);
	const defuddle = await extractPage(page);
	const markdown = await toMarkdown(page, defuddle, { env: worker.env, full: true });
	return { markdown, png };
}
