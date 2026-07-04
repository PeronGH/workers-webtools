import { Defuddle, type DefuddleResponse } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import type { FetchedHtml } from '../types';

export async function extractPage(page: FetchedHtml): Promise<DefuddleResponse> {
	const { document } = parseHTML(page.html);
	return Defuddle(document, page.finalUrl, { includeReplies: true, useAsync: false });
}
