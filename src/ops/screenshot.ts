import { stealthFetchSnapshot } from '../render/container';
import type { RenderOptions } from '../types';

export async function fetchScreenshot(env: Env, request: RenderOptions): Promise<Uint8Array> {
	const { png } = await stealthFetchSnapshot(env, request);
	return png;
}
