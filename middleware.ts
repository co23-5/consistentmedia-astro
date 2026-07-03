// Vercel Edge Middleware: Passwortschutz für die Vorschau.
// Aktiv, solange PREVIEW_PASSWORD gesetzt ist (nur in der Vercel-Umgebung
// "Preview" setzen). Zum Go-Live PREVIEW_PASSWORD entfernen, dann oeffentlich.
// Laeuft am Edge fuer alle HTML-Routen, unabhaengig vom statischen Astro-Build.

export const config = {
  matcher: "/((?!_astro/|fonts/|favicon\\.svg|robots\\.txt|sitemap.*\\.xml).*)",
};

const COOKIE_NAME = "cm_preview";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage

export default async function middleware(
  request: Request,
): Promise<Response | void> {
  const password = process.env.PREVIEW_PASSWORD;
  if (!password) return; // oeffentlich

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (match && match[1] === password) return; // authentifiziert

  const url = new URL(request.url);

  if (
    request.method === "POST" &&
    (request.headers.get("content-type") ?? "").includes("form")
  ) {
    try {
      const form = await request.formData();
      if (String(form.get("password") ?? "") === password) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: url.pathname + url.search,
            "Set-Cookie": `${COOKIE_NAME}=${password}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`,
          },
        });
      }
      return loginPage(true);
    } catch {
      return loginPage(true);
    }
  }

  return loginPage(false);
}

function loginPage(error: boolean): Response {
  const errorMarkup = error
    ? '<p class="error">Falsches Passwort. Bitte erneut versuchen.</p>'
    : "";

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vorschau · Consistent Media</title>
<meta name="robots" content="noindex,nofollow">
<style>
  *,*::before,*::after { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;
    background:#000; color:#fff; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { background:#0a0a0a; border:1px solid rgba(255,255,255,0.1); max-width:440px; width:100%; padding:56px 48px; }
  .brand { font-weight:800; font-size:18px; letter-spacing:0.02em; text-transform:lowercase; margin-bottom:36px; }
  .brand span { color:#66ff99; }
  h1 { font-size:24px; font-weight:700; letter-spacing:-0.02em; margin:0 0 12px; }
  p.lead { font-size:14px; color:rgba(255,255,255,0.55); line-height:1.6; margin:0 0 32px; }
  label { display:block; font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.55); margin-bottom:10px; }
  input[type="password"] { width:100%; padding:14px 16px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); color:#fff; font:inherit; font-size:15px; }
  input[type="password"]:focus { outline:none; border-color:rgba(102,255,153,0.5); }
  button { width:100%; padding:16px; margin-top:24px; background:#66ff99; color:#000; border:1px solid #66ff99; font:inherit; font-size:13px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; cursor:pointer; transition:opacity 0.2s; }
  button:hover { opacity:0.9; }
  .error { color:#f87171; font-size:13px; margin:16px 0 0; font-weight:500; }
</style>
</head>
<body>
  <form class="card" method="post" autocomplete="off">
    <div class="brand">consistent<span>media</span></div>
    <h1>Vorschau-Zugang</h1>
    <p class="lead">Diese Seite ist waehrend der Vorbereitung passwortgeschuetzt. Bitte gib das Vorschau-Passwort ein.</p>
    <label for="password">Passwort</label>
    <input type="password" id="password" name="password" autofocus required>
    <button type="submit">Vorschau oeffnen</button>
    ${errorMarkup}
  </form>
</body>
</html>`;

  return new Response(html, {
    status: error ? 401 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
