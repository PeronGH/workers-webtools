import type { parseHTML } from 'linkedom';

type ParsedDocument = ReturnType<typeof parseHTML>['document'];

// Chromium wraps PDF navigations in a synthetic document whose body holds a single <embed type="application/pdf"> pointing at the PDF.
// See third_party/blink/renderer/core/html/plugin_document.cc — PluginDocumentParser::CreateDocumentStructure.
export function extractPdfUrl(document: ParsedDocument): string | undefined {
	const embed = document.querySelector('body > embed[type="application/pdf"]');
	return embed?.getAttribute('src') ?? undefined;
}

export async function pdfToMarkdown(blob: Blob, env: Env): Promise<string> {
	const result = await env.AI.toMarkdown({ name: 'document.pdf', blob });
	if (result.format !== 'markdown') {
		throw new Error(`PDF conversion failed: ${result.error ?? 'unknown error'}`);
	}
	return result.data;
}
