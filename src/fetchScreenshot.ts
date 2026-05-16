import { launch } from '@cloudflare/playwright';

export async function fetchScreenshot(url: string, env: Env): Promise<Uint8Array> {
	const browser = await launch(env.BROWSER);
	try {
		const page = await browser.newPage();
		try {
			await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
		} catch {
			// Best-attempt: capture whatever rendered by the timeout.
		}
		return await page.screenshot({ fullPage: true, type: 'png' });
	} finally {
		await browser.close();
	}
}
