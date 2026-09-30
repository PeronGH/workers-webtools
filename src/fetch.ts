import { env } from "cloudflare:workers";
import { BROWSER_HEADERS, CURL_HEADERS, fetchPage, type Page, renderHtml } from "./http";
import { rewriteUrl } from "./rewrite";

/**
 * What a fetch returns: text is Markdown for web pages and PDFs and the body
 * itself for other text, and an image is the bytes as served.
 */
export type FetchedContent = { type: "text"; text: string } | { type: "image"; data: Uint8Array; mimeType: string };

// Outer bound on the network work, above Kitesurf's own render cap so a render
// that lands just under it still gets through. The Anubis retry shares it.
const FETCH_TIMEOUT_MS = 60_000;

// A missing content type is treated as HTML, matching how browsers sniff pages.
function isHtml(contentType: string): boolean {
	return contentType === "" || contentType.startsWith("text/html") || contentType.startsWith("application/xhtml+xml");
}

// Servers often send PDFs as application/octet-stream, so trust the magic bytes too.
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function isPdf(page: Page): boolean {
	return page.contentType.startsWith("application/pdf") || PDF_MAGIC.every((byte, i) => page.body[i] === byte);
}

// NUL never occurs in text, and many replacement chars mean the body wasn't UTF-8.
function looksBinary(text: string): boolean {
	if (text.includes("\u0000")) return true;
	let replacements = 0;
	for (const char of text) {
		if (char === "\uFFFD") replacements++;
	}
	return replacements > text.length * 0.1;
}

// Anubis serves a proof-of-work interstitial carrying a `<script
// id="anubis_challenge">` payload instead of the page; requiring a real
// `<script` tag keeps escaped mentions in page text from matching.
const ANUBIS_CHALLENGE = /<script\b[^>]*\bid=["']?anubis_challenge["'\s>]/i;

// SVG is XML, so it stays text.
function imageMimeType(contentType: string): string | undefined {
	const mimeType = contentType.split(";")[0].trim();
	return mimeType.startsWith("image/") && mimeType !== "image/svg+xml" ? mimeType : undefined;
}

function nonHtmlContent(url: string, page: Page): FetchedContent {
	const mimeType = imageMimeType(page.contentType);
	if (mimeType) return { type: "image", data: page.body, mimeType };

	const text = new TextDecoder().decode(page.body);
	if (looksBinary(text)) {
		throw new Error(`Cannot fetch ${url}: content is binary (${page.contentType}). Download it with curl instead.`);
	}
	return { type: "text", text };
}

async function toMarkdown(url: string, document: MarkdownDocument, conversionOptions?: ConversionOptions): Promise<string> {
	const result = await env.AI.toMarkdown(document, { conversionOptions });
	if (result.format === "error") throw new Error(`Cannot convert ${url}: ${result.error}`);
	return result.data;
}

function htmlToMarkdown(html: string, url: string): Promise<string> {
	return toMarkdown(url, { name: "page.html", blob: new Blob([html], { type: "text/html" }) }, { html: { hostname: url } });
}

function pdfToMarkdown(pdf: Uint8Array<ArrayBuffer>, url: string): Promise<string> {
	return toMarkdown(url, { name: "document.pdf", blob: new Blob([pdf], { type: "application/pdf" }) });
}

/** Fetch a URL and return web pages and PDFs as Markdown, other text as is, and images as bytes. */
export async function fetchContent(target: string, render: boolean, signal: AbortSignal): Promise<FetchedContent> {
	const { url, fetchAs = render ? "renderer" : "default" } = rewriteUrl(target);
	const deadline = AbortSignal.any([AbortSignal.timeout(FETCH_TIMEOUT_MS), signal]);

	if (fetchAs === "renderer") {
		return { type: "text", text: await htmlToMarkdown(await renderHtml(url, deadline), url) };
	}

	let page = await fetchPage(url, fetchAs === "curl" ? CURL_HEADERS : BROWSER_HEADERS, deadline);
	if (isPdf(page)) return { type: "text", text: await pdfToMarkdown(page.body, page.url) };
	if (!isHtml(page.contentType)) return nonHtmlContent(url, page);

	let html = new TextDecoder().decode(page.body);
	// Anubis only challenges browser-like clients; refetch as curl to slip past.
	if (fetchAs === "default" && ANUBIS_CHALLENGE.test(html)) {
		page = await fetchPage(url, CURL_HEADERS, deadline);
		html = new TextDecoder().decode(page.body);
	}
	return { type: "text", text: await htmlToMarkdown(html, page.url) };
}
