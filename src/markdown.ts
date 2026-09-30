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

// Titles become `[text](url "title")` and nearly always repeat the link text.
const UNTITLED_ELEMENTS = ['a[title]', 'img[title]'];

/** HTML stripped of hidden content, non-<nav> navigation, JSON-LD, and link titles, ready for conversion. */
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
	let rewriter = new HTMLRewriter().on('script#anubis_challenge', {
		element: () => {
			anubisChallenge = true;
		},
	});
	for (const selector of REMOVED_ELEMENTS) {
		rewriter = rewriter.on(selector, { element: (element) => void element.remove() });
	}
	for (const selector of UNTITLED_ELEMENTS) {
		rewriter = rewriter.on(selector, { element: (element) => void element.removeAttribute('title') });
	}
	const html = await rewriter.transform(new Response(body)).text();
	return { html, anubisChallenge };
}

const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DELIMITER_ROW = /^\s*\|[\s|:-]+\|\s*$/;
// Link and image targets, which the conversion always makes absolute.
const LINK_TARGET = /\]\(([^\s)]+)/g;
// A non-image link whose text could be its own target, e.g. `[https://a.b](https://a.b)`.
const BARE_LINK = /(?<!!)\[([^[\]\s]+)\]\(([^\s)]+)\)/g;
const MARKDOWN_ESCAPE = /\\([!-/:-@[-`{-~])/g;

function unescapeUnderscores(target: string): string {
	return target.replace(/%5F/gi, '_');
}

/**
 * Collapse the column padding the conversion adds to tables: `| x | y      |`
 * becomes `| x | y |`, `| - | ------ |` becomes `| --- | --- |`.
 */
function collapseTablePadding(line: string): string {
	if (!TABLE_ROW.test(line)) return line;
	if (TABLE_DELIMITER_ROW.test(line)) {
		return line
			.replace(/:?-+:?/g, (dashes) => `${dashes.startsWith(':') ? ':' : ''}---${dashes.endsWith(':') ? ':' : ''}`)
			.replace(/ {2,}/g, ' ');
	}
	return line.replace(/ {2,}\|/g, ' |').replace(/\| {2,}/g, '| ');
}

/** Turn `[url](url)` into the autolink `<url>`, which says the same thing once. */
function autolinkBareUrls(line: string): string {
	return line.replace(BARE_LINK, (link, text: string, target: string) => {
		const url = unescapeUnderscores(target);
		return text.replace(MARKDOWN_ESCAPE, '$1') === url ? `<${url}>` : link;
	});
}

/**
 * Tidy converted Markdown outside fenced code: collapse table padding, write
 * links whose text is their URL as autolinks, undo the conversion's needless
 * `%5F` escaping of `_`, and shorten links within the origin of `base` to
 * root-relative paths, which resolve against `base` exactly.
 */
export function tidyMarkdown(markdown: string, base: string): string {
	const { origin } = new URL(base);
	const shorten = (target: string) => {
		const unescaped = unescapeUnderscores(target);
		if (unescaped === origin) return '/';
		return unescaped.startsWith(`${origin}/`) ? unescaped.slice(origin.length) : unescaped;
	};

	let inFence = false;
	return markdown
		.split('\n')
		.map((line) => {
			if (FENCE.test(line)) inFence = !inFence;
			if (inFence) return line;
			const linked = autolinkBareUrls(line).replace(LINK_TARGET, (_, target: string) => `](${shorten(target)}`);
			return collapseTablePadding(linked);
		})
		.join('\n');
}
