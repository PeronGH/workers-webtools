import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { toMarkdown } from '../extract/markdown';
import { extractPdfUrl, pdfToMarkdown } from '../extract/pdf';
import { fetchHtml } from '../render/container';
import { fetchFastHtml } from '../render/fast';
import { fetchPdf } from '../render/pdf';
import type { FetchedHtml, PageRequest, WorkerCtx } from '../types';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const page = await fetchPage(worker, request);
	const { document } = parseHTML(page.html);
	const pdfUrl = extractPdfUrl(document);
	if (pdfUrl) {
		const blob = await fetchPdf(pdfUrl);
		return pdfToMarkdown(blob, worker.env);
	}
	const defuddle = await Defuddle(document, page.finalUrl, { includeReplies: true });
	return toMarkdown(page, defuddle, worker.env);
}

async function fetchPage(worker: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	if (request.fast === false) return fetchHtml(worker, request);
	try {
		return await fetchFastHtml(worker, request);
	} catch {
		return fetchHtml(worker, request);
	}
}
