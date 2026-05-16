import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified, type Plugin } from 'unified';

type HtmlNode = {
	type: string;
	properties?: Record<string, unknown>;
	children?: HtmlNode[];
};

function visit(node: HtmlNode, visitor: (node: HtmlNode) => void): void {
	visitor(node);
	for (const child of node.children ?? []) {
		visit(child, visitor);
	}
}

function absolutize(properties: Record<string, unknown>, name: string, baseUrl: string): void {
	const value = properties[name];
	if (typeof value !== 'string' || value === '' || value.startsWith('#')) return;
	try {
		const url = new URL(value, baseUrl);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			properties[name] = url.toString();
		}
	} catch {}
}

function rehypeAbsoluteUrls(baseUrl: string): Plugin<[], HtmlNode> {
	return () => (tree) => {
		visit(tree, (node) => {
			if (node.type !== 'element' || !node.properties) return;
			absolutize(node.properties, 'href', baseUrl);
			absolutize(node.properties, 'src', baseUrl);
		});
	};
}

export async function htmlToMarkdown(html: string, url: string): Promise<string> {
	const file = await unified()
		.use(rehypeParse)
		.use(rehypeAbsoluteUrls(url))
		.use(rehypeRemark)
		.use(remarkGfm)
		.use(remarkStringify, { bullet: '-', fences: true })
		.process(html);

	return String(file);
}
