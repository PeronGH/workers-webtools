import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { stealthFetchSnapshot } from '../render/container';
import type { RenderOptions, WorkerCtx } from '../types';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(worker: WorkerCtx, request: RenderOptions): Promise<Snapshot> {
	const { png, ...page } = await stealthFetchSnapshot(worker, request);
	const defuddle = await extractPage(page);
	const markdown = await toMarkdown(page, defuddle, { env: worker.env, raw: true });
	return { markdown, png };
}
