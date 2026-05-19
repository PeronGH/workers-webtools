import { Defuddle, type DefuddleResponse } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import type { FetchedHtml } from '../types';

/** Parse the fetched HTML through Defuddle for metadata and cleaned content. */
export async function extractPage(page: FetchedHtml): Promise<DefuddleResponse> {
	const { document } = parseHTML(page.html);
	return Defuddle(document, page.finalUrl, { includeReplies: true });
}

/** Classify a Defuddle result as a Cloudflare interstitial / challenge page. */
export function isCloudflareChallenge(defuddle: DefuddleResponse): boolean {
	return (
		defuddle.title === 'Just a moment...' ||
		defuddle.site === 'Cloudflare' ||
		defuddle.content.trim() === ''
	);
}
