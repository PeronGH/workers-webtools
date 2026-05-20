export async function fetchDirect(url: string, env: Env): Promise<string | null> {
	const response = await fetch(url, { headers: { 'user-agent': 'curl/8.7.1' } }).catch(() => null);
	if (!response?.ok) {
		response?.body?.cancel().catch(() => {});
		return null;
	}
	const contentType = response.headers.get('content-type');
	if (!contentType || contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml')) {
		response.body?.cancel().catch(() => {});
		return null;
	}
	const buffer = await response.arrayBuffer();
	const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
	const result = await env.AI.toMarkdown({
		name,
		blob: new Blob([buffer], { type: contentType }),
	});
	return result.format === 'markdown' ? result.data : null;
}
