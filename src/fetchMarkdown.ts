import { extractMarkdown, withRenderedPage } from './page';

export async function fetchMarkdown(url: string, env: Env): Promise<string> {
	return withRenderedPage(url, env, (rendered) => extractMarkdown(rendered, url, env));
}
