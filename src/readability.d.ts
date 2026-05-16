declare module '@mozilla/readability/JSDOMParser' {
	export default class JSDOMParser {
		parse(html: string, url?: string): unknown;
	}
}
