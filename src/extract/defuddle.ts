import { Defuddle, type DefuddleResponse } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import type { FetchedHtml } from '../types';

export type ExtractedPage = { document: Document; defuddle: DefuddleResponse };

export async function extractPage(page: FetchedHtml): Promise<ExtractedPage> {
	const { document } = parseHTML(page.html);
	const defuddle = await Defuddle(document, page.finalUrl, { includeReplies: true });
	return { document, defuddle };
}
