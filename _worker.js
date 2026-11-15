/* Foreman Films — contact relay
 *
 * Cloudflare Pages serves this file in front of the site. It does two things: it answers
 * POST /api/contact by handing the message to Resend, and it passes everything else through
 * to the site itself. The Resend API key lives in the project's secrets, never in the page.
 *
 * Deploy: keep this file beside index.html in the folder you upload.
 * Secret:  Pages project -> Settings -> Variables and secrets -> RESEND_API_KEY (type: Secret)
 */

const TO = "abram@foremanfilms.com";
const FROM = "Portfolio <site@send.foremanfilms.com>";   // must be on the domain verified in Resend

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Use POST." }, 405);
      }

      let f;
      try {
        f = await request.json();
      } catch {
        return json({ ok: false, error: "Malformed request." }, 400);
      }

      /* the honeypot field is invisible on the page, so anything in it came from a bot.
         answer as though it worked - a bot told it failed just tries again */
      if (f.company) return json({ ok: true });

      const name = clean(f.name, 100);
      const email = clean(f.email, 200);
      const subject = clean(f.subject, 200);
      const message = clean(f.message, 5000);

      if (!name || !subject || !message || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
        return json({ ok: false, error: "Please fill in every field." }, 400);
      }

      if (!env.RESEND_API_KEY) {
        return json({ ok: false, error: "Mail is not configured yet." }, 500);
      }

      let sent;
      try {
        sent = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: FROM,
            to: [TO],
            reply_to: email,          /* so Reply goes straight back to whoever wrote in */
            subject: subject,
            text: message + "\n\n— " + name + "\n" + email,
            html: "<p style=\"white-space:pre-wrap\">" + esc(message) + "</p>"
              + "<p style=\"color:#777;font-size:13px\">— " + esc(name)
              + "<br><a href=\"mailto:" + esc(email) + "\">" + esc(email) + "</a></p>"
          })
        });
      } catch {
        return json({ ok: false, error: "Could not reach the mail service." }, 502);
      }

      if (!sent.ok) {
        console.log("resend " + sent.status + ": " + (await sent.text()).slice(0, 300));
        return json({ ok: false, error: "The mail service refused it." }, 502);
      }

      return json({ ok: true });
    }

    return env.ASSETS.fetch(request);    /* everything else is the site */
  }
};

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function esc(t) {
  return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
