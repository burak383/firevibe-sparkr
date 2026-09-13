// Straight-line ("kuş uçuşu") distance between two GPS points, used to show
// real "X km away" numbers on profiles instead of the old static per-user
// `distanceKm` placeholder (see routes/discovery.js, routes/radar.js).
//
// This is plain trigonometry (the haversine formula) - no external service
// (Google Maps, etc.) is needed, and none is billed/queried. That keeps this
// in line with the rest of the backend's zero-npm-dependency design.
//
// Coordinates themselves (`latitude`/`longitude` on a user row - see
// routes/users.js's buildPatch) are NEVER returned to any client, not even
// the owning user's own account - see serialize.js, which only ever exposes
// the computed distanceKm number. Only this module ever reads the raw
// values.
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function hasCoords(user) {
  return !!user && typeof user.latitude === 'number' && typeof user.longitude === 'number';
}

// Returns the real distance in km, or null if either side hasn't shared a
// real GPS position yet (location permission never granted, or granted but
// not saved yet) - callers decide their own fallback, see resolveDistanceKm.
function distanceBetween(userA, userB) {
  if (!hasCoords(userA) || !hasCoords(userB)) return null;
  return haversineKm(userA.latitude, userA.longitude, userB.latitude, userB.longitude);
}

// The one function routes/serialize should actually call: real distance
// between `viewer` and `candidate` when both have coordinates, rounded to
// one decimal; otherwise falls back to `candidate`'s old static `distanceKm`
// field (0 for every real signup, a fixed per-bot value for the 5 seed
// accounts - see seed.js and routes/auth.js) so nothing regresses for
// accounts that haven't shared a location yet.
function resolveDistanceKm(viewer, candidate) {
  const real = distanceBetween(viewer, candidate);
  if (real !== null) return Math.round(real * 10) / 10;
  return candidate && candidate.distanceKm != null ? candidate.distanceKm : 0;
}

module.exports = { haversineKm, distanceBetween, resolveDistanceKm };
