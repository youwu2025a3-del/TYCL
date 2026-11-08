export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'tycl-curseforge' }), {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
    if (!url.pathname.startsWith('/v1/')) {
      return new Response('Not found', { status: 404 });
    }
    if (!env.CURSEFORGE_API_KEY) {
      return new Response(JSON.stringify({ error: 'CurseForge key is not configured' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    const target = new URL(`https://api.curseforge.com${url.pathname}${url.search}`);
    const upstream = await fetch(target, {
      headers: {
        'x-api-key': env.CURSEFORGE_API_KEY,
        Accept: 'application/json',
        'User-Agent': 'TYCL-Launcher',
      },
    });
    const headers = new Headers(upstream.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=60');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
