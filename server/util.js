// ── Мелкие хелперы, общие для http.js и admin.js ──────────────────────
export const MAX_BODY = 64 * 1024; // больше 64 КБ телу запроса у нас взяться неоткуда

export function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) { req.destroy(); return {}; }
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return {}; }
}
