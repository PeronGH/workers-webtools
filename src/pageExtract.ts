import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';

const REDDIT_LISTING = /^\/(r|u|user)\/[^/]+(\/[^/]+)?\/?$/;
const SE_QUESTION = /^\/questions\/\d+(\/|$)/;

// Stack Exchange network — all run the same Q&A engine, same DOM, Defuddle mangles question pages the same way.
const STACKEXCHANGE_HOSTS = new Set([
	'stackoverflow.com',
	'serverfault.com',
	'superuser.com',
	'askubuntu.com',
	'mathoverflow.net',
	'stackapps.com',
]);

function isStackExchange(hostname: string): boolean {
	return STACKEXCHANGE_HOSTS.has(hostname) || hostname.endsWith('.stackexchange.com');
}

/** Hosts/paths where Defuddle's extractor mangles the structure. */
function shouldDefuddle(url: URL): boolean {
	if (/(^|\.)reddit\.com$/.test(url.hostname) && REDDIT_LISTING.test(url.pathname)) return false;
	if (isStackExchange(url.hostname) && SE_QUESTION.test(url.pathname)) return false;
	return true;
}

/**
 * Convert a settled page (HTML + final URL + originating Content-Type) into
 * Markdown. Defuddle removes boilerplate; env.AI.toMarkdown does the
 * HTML → Markdown step because Defuddle's bundled turndown converter needs
 * DOMParser, which isn't in the Workers runtime.
 */
export async function extractMarkdown(
	html: string,
	finalUrl: string,
	contentType: string | undefined,
	env: Env,
): Promise<string> {
	const ct = contentType?.split(';')[0]?.trim().toLowerCase();
	const isConvertible =
		ct === undefined ||
		ct === '' ||
		ct.startsWith('text/') ||
		ct === 'application/xhtml+xml' ||
		ct === 'application/json' ||
		ct === 'application/xml' ||
		ct.endsWith('+json') ||
		ct.endsWith('+xml');
	if (!isConvertible) {
		return `Cannot convert ${contentType} resource to Markdown. Source: ${finalUrl}`;
	}
	const pageUrl = new URL(finalUrl);
	let contentHtml = html;
	const meta: Record<string, string | undefined> = { url: finalUrl };
	if (shouldDefuddle(pageUrl)) {
		const { document } = parseHTML(html);
		const extracted = await Defuddle(document, finalUrl, { includeReplies: true });
		contentHtml = extracted.content;
		meta.title = extracted.title;
		meta.description = extracted.description;
		meta.author = extracted.author;
		meta.site = extracted.site;
		meta.published = extracted.published;
		meta.image = extracted.image;
	}
	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([contentHtml], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: pageUrl.origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${result.error ?? 'unknown error'}`);
	}
	return buildFrontMatter(meta) + result.data;
}

function buildFrontMatter(fields: Record<string, string | undefined>): string {
	const entries = Object.entries(fields).filter(([, v]) => v && v.trim().length > 0);
	if (entries.length === 0) return '';
	const lines = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `---\n${lines.join('\n')}\n---\n\n`;
}
