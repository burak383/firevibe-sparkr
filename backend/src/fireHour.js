// Fire Hour window - 21:00-22:00, every night, server local time. Shared by
// routes/radar.js (the countdown/status text the app displays) and
// matching.js (which flags a match created during this window as a
// "Fire Hour match" - see matching.js's FIRE_HOUR_MATCH_TTL_MS for the
// 24h expiring-match mechanic built on top of that flag).
function getFireHourWindow(now = new Date()) {
  const start = new Date(now);
  start.setHours(21, 0, 0, 0);
  const end = new Date(start);
  end.setHours(22, 0, 0, 0);
  return { start, end };
}

function isFireHourLive(now = new Date()) {
  const { start, end } = getFireHourWindow(now);
  return now >= start && now < end;
}

module.exports = { getFireHourWindow, isFireHourLive };
