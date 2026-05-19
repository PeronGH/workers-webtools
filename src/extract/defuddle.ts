import { Defuddle, type DefuddleResponse } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import type { FetchedHtml } from '../types';

/** Parse the fetched HTML through Defuddle for metadata and cleaned content. */
export async function extractPage(page: FetchedHtml): Promise<DefuddleResponse> {
	const { document } = parseHTML(page.html);
	return Defuddle(document, page.finalUrl, { includeReplies: true });
}

/** Classify a Defuddle result as a blocked / interstitial response (typically Cloudflare). */
export function isResponseBlocked(defuddle: DefuddleResponse): boolean {
	return (
		defuddle.title === 'Just a moment...' ||
		defuddle.title === 'Attention Required!' ||
		defuddle.title.toLowerCase().includes('captcha') ||
		defuddle.site === 'Cloudflare' ||
		defuddle.wordCount === 0
	);
}
