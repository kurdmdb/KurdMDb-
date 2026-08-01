// api/sitemap.js
//
// Serves a fully dynamic sitemap.xml at https://kurdmdb.vercel.app/api/sitemap
// Generated live from Supabase on every request.

const SUPABASE_URL = 'https://ayxuklozwgnrzveisvof.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5eHVrbG96d2ducnp2ZWlzdm9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODY2MjAsImV4cCI6MjA5NzQ2MjYyMH0.liuaBRrdk2ChCqgbl0NGB33IShFJmb-qUlla7s0Cnxg';
const SITE_URL = 'https://kurdmdb.vercel.app';

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/works', changefreq: 'daily', priority: '0.9' },
  { path: '/rankings', changefreq: 'weekly', priority: '0.8' },
  { path: '/leaderboard', changefreq: 'weekly', priority: '0.6' },
  { path: '/recommendations', changefreq: 'weekly', priority: '0.6' },
  // '/profile' stays out: it's login-gated, per-user content.
];

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

function toDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('
');
}

async function fetchAllRows(table, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,slug,created_at&order=id.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Range: `${from}-${from + pageSize - 1}`,
        },
      }
    );
    if (!res.ok) throw new Error(`${table}: ${res.status} ${res.statusText}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const entries = STATIC_PAGES.map((p) =>
      urlEntry(`${SITE_URL}${p.path}`, today, p.changefreq, p.priority)
    );

    const [movies, animations] = await Promise.all([
      fetchAllRows('movies'),
      fetchAllRows('animation'),
    ]);

    for (const m of movies) {
      entries.push(urlEntry(
        `${SITE_URL}/movie/${m.slug || m.id}`,
        toDateOnly(m.created_at), 'monthly', '0.7'
      ));
    }
    for (const a of animations) {
      entries.push(urlEntry(
        `${SITE_URL}/animation/${a.slug || a.id}`,
        toDateOnly(a.created_at), 'monthly', '0.7'
      ));
    }

    const xml = '<?xml version="1.0" encoding="UTF-8"?>
'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
'
      + entries.join('
') + '
</urlset>
';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).send(xml);
  } catch (e) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(500).send(`<!-- sitemap generation failed: ${e.message} -->`);
  }
}
