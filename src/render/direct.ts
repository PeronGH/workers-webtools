export async function fetchDirect(url: string, env: Env): Promise<string | null> {
	const response = await fetch(url).catch(() => null);
	if (!response?.ok) {
		response?.body?.cancel().catch(() => {});
		return null;
	}
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.startsWith('application/pdf') || contentType.startsWith('image/')) {
		return aiToMarkdown(url, response, contentType, env);
	}
	response.body?.cancel().catch(() => {});
	return null;
}

async function aiToMarkdown(url: string, response: Response, contentType: string, env: Env): Promise<string> {
	const buffer = await response.arrayBuffer();
	const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
	const result = await env.AI.toMarkdown({
		name,
		blob: new Blob([buffer], { type: contentType }),
	});
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${result.error ?? 'unknown error'}`);
	}
	return result.data;
}
