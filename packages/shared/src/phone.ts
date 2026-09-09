// Phone formatting — one canonical shape for the emergency contact numbers so
// the admin sheet, the CSV export and the player's own form all agree.
//
// North American numbers (10 digits, or 11 starting with the country code 1)
// render as `+1 123-456-7891`. Anything else — an international number, a
// number with an extension, a half-typed one — is left exactly as the player
// wrote it: better a raw string someone can still dial than a mangled one.

function group(local: string): string {
  const parts = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 10)].filter(Boolean);
  return `+1 ${parts.join('-')}`;
}

/** `+1 123-456-7891` for NANP numbers; the input unchanged otherwise. */
export function formatPhone(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  const local =
    digits.length === 10 ? digits : digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : null;
  return local ? group(local) : value;
}

/**
 * The same format, applied while someone types: partial input formats as far as
 * it goes (`+1 123-45`) instead of waiting for all ten digits. A `+` followed by
 * any country code other than 1 opts out, so an international number can still
 * be typed in full.
 */
export function formatPhoneInput(raw: string): string {
  const value = raw.trimStart();
  if (!value) return '';
  if (/^\+(?!1)/.test(value)) return value; // international — don't fight the typist
  // Drop the `+1` we rendered on the previous keystroke, so its digit isn't
  // mistaken for the start of the area code.
  const digits = value.replace(/^\+\s*1[\s-]*/, '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  // Too many digits for a NANP number (a pasted international one, say) — leave it.
  if (!local || local.length > 10) return value;
  return group(local);
}

/** `tel:` href for a formatted or raw number (`tel:+11234567891`). */
export function phoneHref(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  // Not a NANP number — keep any leading `+` and drop the punctuation dialers ignore.
  return `tel:${value.startsWith('+') ? '+' : ''}${digits}`;
}
