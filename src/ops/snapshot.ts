import { pageToMarkdown } from '../extract/markdown';
import { stealthFetchSnapshot } from '../render/container';
import type { PageRequest } from '../types';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(env: Env, request: PageRequest): Promise<Snapshot> {
	const { png, ...page } = await stealthFetchSnapshot(env, request);
	const markdown = await pageToMarkdown(env, page, request.raw);
	return { markdown, png };
}
