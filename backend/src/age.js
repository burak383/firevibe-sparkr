// Shared birth-date -> age math, used by BOTH the direct email/password
// register flow (routes/auth.js) and the one-time age-verification step for
// social-login accounts (routes/users.js's vibe-setup handler - see its own
// comment for why that needed one). Pulled out to its own file instead of
// being duplicated in both places.
function computeAge(birthDate) {
  if (!birthDate) return null;
  const parts = String(birthDate)
    .split(/[/\-.]/)
    .map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  let day, month, year;
  if (parts[0] > 31) {
    [year, month, day] = parts;
  } else {
    [day, month, year] = parts;
  }
  const dob = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

module.exports = { computeAge };
