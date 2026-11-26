export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			return Response.json({ name: "Cloudflare" });
		}

		return await env.ASSETS.fetch(request);
	},
};
