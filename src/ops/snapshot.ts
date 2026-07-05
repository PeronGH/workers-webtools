import { extractPage } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { stealthFetchSnapshot } from '../render/container';
import type { PageRequest } from '../types';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(env: Env, request: PageRequest): Promise<Snapshot> {
	const { png, ...page } = await stealthFetchSnapshot(env, request);
	const defuddle = await extractPage(page);
	const markdown = await toMarkdown(page, defuddle, { env, raw: request.raw });
	return { markdown, png };
}
