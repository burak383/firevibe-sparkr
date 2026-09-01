// Sends the OTP codes issued by routes/auth.js's /api/auth/sms/request as
// real text messages via iletiMerkezi (iletimerkezi.com) - a Turkish SMS API
// provider, chosen specifically because it has a genuine bireysel
// (individual, no company/vergi levhası) account tier: just a TC kimlik
// fotokopisi + an e-Devlet "Yerleşim Yeri" belgesi, sent over KEP - see
// https://www.iletimerkezi.com/toplu-sms-gerekli-evraklar. (Netgsm was tried
// first; even its "bireysel" tier turned out to still require a vergi
// levhası, which a private individual with no registered business doesn't
// have.)
//
// Unlike the Netgsm attempt, this needed no extra npm package - iletiMerkezi
// exposes a plain JSON REST API (see docs.iletimerkezi.com/docs/api), so this
// stays inside this backend's zero-dependency rule using only the built-in
// `fetch` (stable in Node 18+, which package.json already requires).
const API_KEY = process.env.ILETIMERKEZI_API_KEY || '';
const API_HASH = process.env.ILETIMERKEZI_API_HASH || '';
const SENDER = process.env.ILETIMERKEZI_SENDER || '';

const isSmsProviderConfigured = Boolean(API_KEY && API_HASH && SENDER);

// `phone` arrives already normalized to Turkey's +90XXXXXXXXXX form by
// routes/auth.js's normalizeContact() - iletiMerkezi's `number` field wants
// the country code WITHOUT the leading "+" (90XXXXXXXXXX).
function toIletiMerkeziNumber(phone) {
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

// Throws on failure - callers decide whether that should block the request
// or just get logged (see routes/auth.js, which currently logs and moves on
// rather than failing signup/login over a delivery hiccup, since the code
// is still valid in the DB either way).
async function sendOtpSms(phone, code) {
  const res = await fetch('https://api.iletimerkezi.com/v1/send-sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request: {
        authentication: { key: API_KEY, hash: API_HASH },
        order: {
          sender: SENDER,
          message: {
            text: `SparkR dogrulama kodun: ${code}`,
            // "receipents" (sic) is iletiMerkezi's own field name, not a typo
            // introduced here - see their API docs.
            receipents: { number: [toIletiMerkeziNumber(phone)] },
          },
        },
      },
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`iletiMerkezi SMS gönderimi başarısız (HTTP ${res.status}, geçersiz yanıt).`);
  }

  const status = data && data.response && data.response.status;
  if (!status || Number(status.code) !== 200) {
    throw new Error((status && status.message) || `iletiMerkezi SMS gönderimi başarısız (HTTP ${res.status}).`);
  }
}

module.exports = { isSmsProviderConfigured, sendOtpSms };
