export async function fetchDirect(url: string, env: Env): Promise<string | null> {
	const response = await fetch(url).catch(() => null);
	if (!response?.ok) {
		response?.body?.cancel().catch(() => {});
		return null;
	}
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.startsWith('application/pdf')) {
		const buffer = await response.arrayBuffer();
		const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'document.pdf');
		const result = await env.AI.toMarkdown({
			name,
			blob: new Blob([buffer], { type: 'application/pdf' }),
		});
		if (result.format !== 'markdown') {
			throw new Error(`PDF conversion failed: ${result.error ?? 'unknown error'}`);
		}
		return result.data;
	}
	if (contentType.startsWith('text/markdown') || contentType.startsWith('text/plain')) {
		return response.text();
	}
	response.body?.cancel().catch(() => {});
	return null;
}
