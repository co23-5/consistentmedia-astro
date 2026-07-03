import { Resend } from "resend";

// Vercel Function (native, ausserhalb des Astro-Builds). Nimmt die Anfrage vom
// Kontaktformular entgegen, prueft auf Spam und versendet zwei Mails via Resend:
// Benachrichtigung ans Team + Bestaetigung an den Interessenten. Keine Datenbank.

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(ip);
  if (!record || now > record.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeRandomString(s: string): boolean {
  const trimmed = String(s ?? "").trim();
  const letters = trimmed.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
  if (letters.length < 8) return false;
  const vowels = (letters.match(/[aeiouäöüAEIOUÄÖÜ]/g) ?? []).length;
  if (vowels / letters.length < 0.2) return true;
  let midWordCaps = 0;
  for (const word of trimmed.split(/[\s\-']+/)) {
    for (let i = 1; i < word.length; i++) {
      if (/[A-ZÄÖÜ]/.test(word[i])) midWordCaps++;
    }
  }
  return midWordCaps >= 3;
}

function detectSpam(p: {
  name: string;
  company: string;
  message: string;
  website: unknown;
  formLoadedAt: unknown;
}): string | null {
  if (typeof p.website === "string" && p.website.trim() !== "") return "honeypot";
  const loaded = Number(p.formLoadedAt);
  if (!Number.isFinite(loaded)) return "no-timestamp";
  const elapsed = Date.now() - loaded;
  if (elapsed < 3000) return "too-fast";
  if (elapsed > 24 * 60 * 60 * 1000) return "too-old";
  if (looksLikeRandomString(p.name)) return "random-name";
  if (looksLikeRandomString(p.company)) return "random-company";
  if (looksLikeRandomString(p.message)) return "random-message";
  return null;
}

function notificationEmail(o: {
  name: string; email: string; company: string; message: string;
  anliegen: string; unternehmensgroesse: string;
}): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;">
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111;font-size:14px;line-height:1.6;">
  <p style="margin:0 0 20px;font-weight:bold;font-size:16px;">Neue Anfrage — consistentmedia.de</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;width:100px;">Name</td><td style="padding:6px 0;">${o.name}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">E-Mail</td><td style="padding:6px 0;"><a href="mailto:${o.email}" style="color:#111;">${o.email}</a></td></tr>
    ${o.company ? `<tr><td style="padding:6px 12px 6px 0;color:#666;">Unternehmen</td><td style="padding:6px 0;">${o.company}</td></tr>` : ""}
    ${o.anliegen ? `<tr><td style="padding:6px 12px 6px 0;color:#666;">Anliegen</td><td style="padding:6px 0;">${o.anliegen}</td></tr>` : ""}
    ${o.unternehmensgroesse ? `<tr><td style="padding:6px 12px 6px 0;color:#666;">Unternehmensgröße</td><td style="padding:6px 0;">${o.unternehmensgroesse}</td></tr>` : ""}
  </table>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 20px;">
  <p style="margin:0 0 8px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Nachricht</p>
  <p style="margin:0;white-space:pre-wrap;">${o.message}</p>
</div></body></html>`;
}

function confirmationEmail(name: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:#ffffff;padding:40px;border-radius:2px;">
    <p style="margin:0 0 24px;font-size:15px;color:#111;">Hallo ${name},</p>
    <div style="font-size:15px;color:#333;line-height:1.7;"><p style="margin:0 0 16px;">wir haben deine Nachricht erhalten und melden uns innerhalb von 24 Stunden bei dir.</p></div>
    <p style="margin:24px 0 0;font-size:15px;color:#111;">Viele Grüße<br><strong>Dein Consistent Media Team</strong></p>
  </div>
  <div style="padding:24px 40px;border-top:1px solid #e5e5e5;">
    <p style="margin:0;font-size:12px;color:#999;line-height:1.8;">
      <strong style="color:#555;">Consistent Media</strong> · Krummeck &amp; Hüge GbR<br>
      Helenenstr. 4 · 65183 Wiesbaden<br>
      <a href="mailto:kontakt@consistentmedia.de" style="color:#999;text-decoration:none;">kontakt@consistentmedia.de</a> ·
      <a href="https://consistentmedia.de" style="color:#999;text-decoration:none;">consistentmedia.de</a>
    </p>
  </div>
</div></body></html>`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, 429);
  }

  const { name, email, company, anliegen, unternehmensgroesse, message, website, formLoadedAt } =
    await request.json();

  if (!name || !email || !company || !message) return json({ error: "Pflichtfelder fehlen." }, 400);
  if (!EMAIL_REGEX.test(email)) return json({ error: "Ungültige E-Mail-Adresse." }, 400);
  if (name.length > 200 || email.length > 200 || message.length > 5000) {
    return json({ error: "Eingabe zu lang." }, 400);
  }

  const spamReason = detectSpam({
    name: String(name),
    company: String(company ?? ""),
    message: String(message),
    website,
    formLoadedAt,
  });
  if (spamReason) {
    console.warn("[kontakt] spam abgewiesen", { ip, reason: spamReason, email });
    return json({ success: true });
  }

  const safe = {
    name: escapeHtml(String(name)),
    email: escapeHtml(String(email)),
    company: company ? escapeHtml(String(company)) : "",
    anliegen: anliegen ? escapeHtml(String(anliegen).slice(0, 100)) : "",
    unternehmensgroesse: unternehmensgroesse ? escapeHtml(String(unternehmensgroesse).slice(0, 100)) : "",
    message: escapeHtml(String(message)),
  };

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Consistent Media Website <kontakt@consistentmedia.de>",
      to: process.env.NOTIFICATION_EMAIL ?? "kontakt@consistentmedia.de",
      replyTo: safe.email,
      subject: `Neue Anfrage von ${safe.name}${safe.company ? ` (${safe.company})` : ""}`,
      html: notificationEmail(safe),
    });
    await resend.emails.send({
      from: "Consistent Media <kontakt@consistentmedia.de>",
      to: safe.email,
      subject: "Deine Anfrage bei Consistent Media",
      html: confirmationEmail(safe.name),
    });
    return json({ success: true });
  } catch (err) {
    console.error("E-Mail-Versand fehlgeschlagen:", err);
    return json({ error: "Versand fehlgeschlagen." }, 500);
  }
}
