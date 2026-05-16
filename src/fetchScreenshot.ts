import { extractScreenshot, withRenderedPage } from './page';

export async function fetchScreenshot(url: string, env: Env): Promise<Uint8Array> {
	return withRenderedPage(url, env, extractScreenshot);
}
