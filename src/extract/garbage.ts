/** Detect render outputs that won't yield useful markdown. */
export function isGarbageOutput(document: Document): boolean {
	return !!document.querySelector('body > img:only-child');
}
