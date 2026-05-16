import { extractScreenshot, withVisualPage } from './page';

export async function fetchScreenshot(url: string, env: Env): Promise<Uint8Array> {
	return withVisualPage(url, env, extractScreenshot);
}
