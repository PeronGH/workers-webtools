import { extractPage, isResponseBlocked } from '../extract/defuddle';
import { toMarkdown } from '../extract/markdown';
import { fetchHtml } from '../render/container';
import { fetchFastHtml } from '../render/fast';
import type { PageRequest, WorkerCtx } from '../types';

export async function fetchMarkdown(worker: WorkerCtx, request: PageRequest): Promise<string> {
	const { page, defuddle } = await loadExtraction(worker, request);
	return toMarkdown(page, defuddle, worker.env);
}

async function loadExtraction(worker: WorkerCtx, request: PageRequest) {
	if (request.fast !== false) {
		try {
			const page = await fetchFastHtml(worker, request);
			const defuddle = await extractPage(page);
			if (!isResponseBlocked(defuddle)) return { page, defuddle };
			console.log(`fast path blocked, retrying via container: ${request.url}`);
		} catch {
			// fast renderer threw — fall through to container
		}
	}
	const page = await fetchHtml(worker, request);
	const defuddle = await extractPage(page);
	return { page, defuddle };
}
