import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { toMarkdown } from '../extract/markdown';
import { fetchSnapshotData } from '../render/container';
import type { PageRequest, WorkerCtx } from '../types';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: PageRequest): Promise<Snapshot> {
	const { png, ...page } = await fetchSnapshotData(worker, request);
	const { document } = parseHTML(page.html);
	const defuddle = await Defuddle(document, page.finalUrl, { includeReplies: true });
	const markdown = await toMarkdown(page, defuddle, worker.env);
	return { markdown, png };
}
