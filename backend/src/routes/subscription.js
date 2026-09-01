// Receives RevenueCat's webhook events - the SOURCE OF TRUTH for who has an
// active "premium" subscription (see ../subscription.js). The mobile app
// itself never gets to declare "I'm premium now"; only a verified event
// from here writes `premiumExpiresAt`.
//
// SETUP (not something I can do from here - needs your own RevenueCat +
// App Store Connect / Google Play Console accounts):
//   1. Create a RevenueCat project, link your App Store Connect and Google
//      Play Console apps to it, and create a subscription product/offering
//      priced at 69,9 TL, with a 1 MONTH duration/billing period - in App
//      Store Connect this is an "Auto-Renewable Subscription" with
//      Subscription Duration = "1 Month"; in Play Console it's a
//      subscription "base plan" with Billing period = "Monthly". This file
//      itself has no duration logic at all - whatever period you configure
//      on the STORE side is what RevenueCat reports back in every webhook's
//      `expiration_at_ms` (see below), a RENEWAL event just pushes that
//      timestamp another billing period out. (RevenueCat docs:
//      https://www.revenuecat.com/docs/getting-started/quickstart).
//   2. In RevenueCat's dashboard, add a Webhook integration pointing at:
//        https://<your-render-url>/api/subscription/revenuecat-webhook
//      and set an "Authorization header value" - any long random string.
//   3. Put that SAME string in this backend's REVENUECAT_WEBHOOK_SECRET
//      env var (Render dashboard -> Environment).
//   4. On the mobile side, react-native-purchases' `Purchases.logIn(userId)`
//      must be called with THIS backend's own numeric user id (see
//      src/utils/subscription.ts) - that's what ends up in
//      event.app_user_id below, which is how we know WHICH of our users
//      just subscribed.
//
// CANNOT BE TESTED FROM THIS SANDBOX: there's no way to trigger a real
// RevenueCat event without an actual purchase (sandbox or production)
// going through the App Store/Play Store. The parsing below follows
// RevenueCat's documented event schema
// (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
// as closely as possible, but treat it as unverified until you've seen a
// real webhook hit it - RevenueCat's dashboard has a "send test webhook"
// button for exactly that, and Render's logs will show what arrived.
const db = require('../db');
const { activateBoost, addBonusSuperlikes, SUPERLIKE_PACK_SIZE } = require('../subscription');

const routes = [];

routes.push({
  method: 'POST',
  path: '/api/subscription/revenuecat-webhook',
  handler: async (req, res, params, body) => {
    const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!expected) {
      console.error('[subscription] REVENUECAT_WEBHOOK_SECRET is not set - refusing webhook');
      return res.status(500).json({ error: 'Sunucu yapılandırılmamış' });
    }

    // RevenueCat's "simple" auth mode: you configure a header VALUE in its
    // dashboard and it echoes that exact string back on every request - no
    // signing/HMAC math needed. (RevenueCat also offers HMAC signing over
    // the raw body for stronger security; this backend's http-helpers.js
    // only ever hands routes the already-JSON-parsed body, not the raw
    // bytes, so HMAC verification isn't wired up here - the shared-secret
    // header is the simpler fit for this project's zero-dependency style.)
    const provided = req.headers['authorization'] || '';
    if (provided !== expected) {
      return res.status(401).json({ error: 'Yetkisiz' });
    }

    const event = body && body.event;
    if (!event || typeof event.app_user_id !== 'string') {
      return res.status(400).json({ error: 'Geçersiz webhook gövdesi' });
    }

    const userId = Number(event.app_user_id);
    if (!Number.isFinite(userId)) {
      // Not one of ours (e.g. RevenueCat's own anonymous-id format from
      // before Purchases.logIn() was called) - acknowledge with 200 anyway
      // so RevenueCat doesn't keep retrying this forever.
      console.log('[subscription] Ignoring webhook for non-numeric app_user_id:', event.app_user_id);
      return res.json({ ok: true, ignored: true });
    }

    const row = db.findById('users', userId);
    if (!row) {
      return res.json({ ok: true, ignored: true });
    }

    // Whatever the event type, if it carries an expiration timestamp, that
    // IS the current truth - trust it directly rather than trying to
    // classify every RevenueCat event type into "this means active" /
    // "this means inactive" ourselves (a cancellation, for instance, does
    // NOT mean access ends immediately - the period the user already paid
    // for still runs until expiration_at_ms). hasActivePremium() in
    // ../subscription.js only ever compares this timestamp to "now", so
    // there's nothing else to keep in sync.
    if (typeof event.expiration_at_ms === 'number') {
      db.update('users', userId, {
        premiumExpiresAt: new Date(event.expiration_at_ms).toISOString(),
        premiumProductId: event.product_id || null,
      });
    } else if (event.type === 'EXPIRATION' || event.type === 'CANCELLATION') {
      // Some event shapes omit expiration_at_ms - but the event itself says
      // it's over, so clear it.
      db.update('users', userId, { premiumExpiresAt: null });
    }

    // "Boost" is a one-time consumable, not a subscription - it never
    // carries expiration_at_ms, so it's handled as its own independent
    // block (not an else-if off the premium logic above). RevenueCat sends
    // either NON_RENEWING_PURCHASE or (on some store/SDK combos)
    // INITIAL_PURCHASE for non-subscription products - accept both. See
    // ../subscription.js's activateBoost (stacks back-to-back purchases
    // instead of resetting the timer).
    if (
      event.product_id === 'sparkr_boost_30min' &&
      (event.type === 'NON_RENEWING_PURCHASE' || event.type === 'INITIAL_PURCHASE')
    ) {
      activateBoost(row);
    }

    // Extra Super Vibe pack - another consumable, same event-type handling
    // as Boost above, just crediting a plain counter instead of a timestamp.
    // See ../subscription.js's addBonusSuperlikes.
    if (
      event.product_id === 'sparkr_superlike_pack_5' &&
      (event.type === 'NON_RENEWING_PURCHASE' || event.type === 'INITIAL_PURCHASE')
    ) {
      addBonusSuperlikes(row, SUPERLIKE_PACK_SIZE);
    }

    console.log(`[subscription] RevenueCat event ${event.type} for user #${userId}`);
    res.json({ ok: true });
  },
});

module.exports = routes;
