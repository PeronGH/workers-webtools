export async function fetchPdf(url: string): Promise<Blob> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
	const buffer = await response.arrayBuffer();
	return new Blob([buffer], { type: 'application/pdf' });
}
