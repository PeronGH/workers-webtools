import { extractMarkdown, extractScreenshot, withVisualPage } from './page';

export type Snapshot = { markdown: string; png: Uint8Array };

export async function fetchSnapshot(url: string, env: Env): Promise<Snapshot> {
	return withVisualPage(url, env, async (rendered) => {
		const [markdown, png] = await Promise.all([extractMarkdown(rendered, url, env), extractScreenshot(rendered)]);
		return { markdown, png };
	});
}
