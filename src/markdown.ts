// Token savers around Workers AI's HTML conversion, which already drops <nav>.

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
];

/** Strip hidden content and non-<nav> navigation before conversion. */
export function cleanHtml(html: string): Promise<string> {
	const rewriter = REMOVED_ELEMENTS.reduce(
		(rewriter, selector) => rewriter.on(selector, { element: (element) => void element.remove() }),
		new HTMLRewriter(),
	);
	return rewriter.transform(new Response(html)).text();
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
