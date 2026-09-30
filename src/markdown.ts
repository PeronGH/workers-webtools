// Token savers around Workers AI's HTML conversion, which already drops <nav>.
// The cleaning pass also spots Anubis challenges, sparing a second parse.

const REMOVED_ELEMENTS = [
	// Hidden content: mobile menu duplicates, modals, templates.
	'[hidden]',
	'[aria-hidden="true"]',
	'[style*="display:none"]',
	'[style*="display: none"]',
	'[style*="visibility:hidden"]',
	'[style*="visibility: hidden"]',
	'template',
	// Navigation and sidebars that aren't <nav>.
	'[role="navigation"]',
	'aside',
	// Structured data for search engines, which the conversion keeps verbatim.
	'script[type="application/ld+json" i]',
];

/** HTML stripped of hidden content, non-<nav> navigation, and JSON-LD, ready for conversion. */
export interface CleanedHtml {
	html: string;
	/**
	 * Whether the page is Anubis's proof-of-work interstitial, which carries a
	 * `<script id="anubis_challenge">` payload instead of the page.
	 */
	anubisChallenge: boolean;
}

/** Clean a page before conversion, spotting an Anubis challenge in the same pass. */
export async function cleanHtml(body: string | Uint8Array<ArrayBuffer>): Promise<CleanedHtml> {
	let anubisChallenge = false;
	const rewriter = REMOVED_ELEMENTS.reduce(
		(rewriter, selector) => rewriter.on(selector, { element: (element) => void element.remove() }),
		new HTMLRewriter().on('script#anubis_challenge', {
			element: () => {
				anubisChallenge = true;
			},
		}),
	);
	const html = await rewriter.transform(new Response(body)).text();
	return { html, anubisChallenge };
}

const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DELIMITER_ROW = /^\s*\|[\s|:-]+\|\s*$/;

/**
 * Collapse the column padding the conversion adds to tables, leaving fenced code
 * alone: `| x | y      |` becomes `| x | y |`, `| - | ------ |` becomes `| --- | --- |`.
 */
export function collapseTablePadding(markdown: string): string {
	let inFence = false;
	return markdown
		.split('\n')
		.map((line) => {
			if (FENCE.test(line)) inFence = !inFence;
			if (inFence || !TABLE_ROW.test(line)) return line;
			if (TABLE_DELIMITER_ROW.test(line)) {
				return line
					.replace(/:?-+:?/g, (dashes) => `${dashes.startsWith(':') ? ':' : ''}---${dashes.endsWith(':') ? ':' : ''}`)
					.replace(/ {2,}/g, ' ');
			}
			return line.replace(/ {2,}\|/g, ' |').replace(/\| {2,}/g, '| ');
		})
		.join('\n');
}
