// Compute a person's age from a YYYY-MM-DD birthday string.
// Returns null when the birthday is missing or malformed.
export function computeAge(birthday: string | undefined | null): number | null {
  if (!birthday) return null;
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const b = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const hadBirthday =
    now.getMonth() > b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  if (!hadBirthday) age--;
  return age >= 0 && age < 150 ? age : null;
}
