// Server-side proxy for the YouTube Data API.
// The API key lives only in the Vercel environment variable YOUTUBE_API_KEY,
// so visitors never need (or see) a key. Only the three read-only calls the
// page uses are allowed, with their parameters checked.

const ALLOWED = {
  search: {
    part: /^snippet$/,
    type: /^playlist$/,
    q: /^[\s\S]{1,200}$/,
    maxResults: /^([1-9]|1\d|2[0-5])$/,
  },
  playlists: {
    part: /^(snippet|contentDetails)(,(snippet|contentDetails))?$/,
    id: /^[\w-]{10,64}(,[\w-]{10,64}){0,49}$/,
  },
  playlistItems: {
    part: /^snippet$/,
    playlistId: /^[\w-]{10,64}$/,
    maxResults: /^([1-9]|[1-4]\d|50)$/,
    pageToken: /^[\w-]{1,64}$/,
  },
};

const CACHE_SECONDS = { search: 3600, playlists: 600, playlistItems: 600 };

function send(res, status, body, cacheSeconds) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400` : 'no-store'
  );
  res.end(JSON.stringify(body));
}

function fail(res, status, message) {
  send(res, status, { error: { message } });
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const url = new URL(req.url, 'http://localhost');
  const endpoint = url.searchParams.get('endpoint');
  const key = process.env.YOUTUBE_API_KEY;

  if (endpoint === 'status') return send(res, 200, { configured: Boolean(key) });
  if (!key) return fail(res, 503, 'השרת עדיין לא הוגדר עם מפתח YouTube');

  const rules = ALLOWED[endpoint];
  if (!rules) return fail(res, 400, 'Unknown endpoint');

  const target = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [name, value] of url.searchParams) {
    if (name === 'endpoint') continue;
    const rule = rules[name];
    if (!rule || !rule.test(value)) return fail(res, 400, `Invalid parameter: ${name}`);
    target.searchParams.set(name, value);
  }
  target.searchParams.set('key', key);

  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data?.error?.message || `YouTube error ${upstream.status}`;
      return fail(res, upstream.status, message);
    }
    return send(res, 200, data, CACHE_SECONDS[endpoint]);
  } catch (e) {
    return fail(res, 502, 'לא ניתן להתחבר ל־YouTube כרגע');
  }
};
