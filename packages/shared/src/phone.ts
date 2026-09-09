import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

// Phone formatting for the emergency contacts. Players' numbers come from
// anywhere — Canada, Brazil, Australia — so digit-counting can't be the rule:
// a São Paulo mobile (DD 11 + 9 digits) has exactly as many digits as a NANP
// number with its leading 1, and only real numbering-plan metadata can tell
// them apart. libphonenumber-js does that.
//
// The contract, in one line: a number that VALIDATES is rendered in a canonical
// international shape; anything else is left exactly as typed. Nothing here ever
// invents or drops a digit — in particular no `+1` is ever added to a number
// that hasn't been confirmed as a North American one.

/** Where the league plays, so a number typed with no country code is read as local. */
export const DEFAULT_REGION: CountryCode = 'CA';

/** NANP numbers keep the `+1 604-555-1234` shape the group asked for. */
function formatNanp(nationalDigits: string): string {
  const parts = [nationalDigits.slice(0, 3), nationalDigits.slice(3, 6), nationalDigits.slice(6, 10)].filter(Boolean);
  return `+1 ${parts.join('-')}`;
}

/** The canonical form of a complete, valid number — or null if it isn't one. */
function canonical(value: string, region: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(value, region);
  if (!parsed || !parsed.isValid()) return null;
  // `+1` covers Canada, the US and the Caribbean; the rest use the international
  // grouping for their own plan (`+55 11 91234 5678`, `+61 2 1234 5678`).
  const base =
    parsed.countryCallingCode === '1' ? formatNanp(parsed.nationalNumber) : parsed.formatInternational();
  // An extension is part of how you reach the person — never drop it.
  return parsed.ext ? `${base} ext. ${parsed.ext}` : base;
}

/**
 * Canonical form for storing and displaying a number: `+1 604-555-1234` for
 * North America, the country's own international grouping elsewhere. A number
 * that doesn't validate (a local number from a country we can't infer, an
 * extension, a half-typed one) is returned untouched — better a raw string
 * someone can still dial than a confidently wrong one.
 */
export function formatPhone(raw: string | null | undefined, region: CountryCode = DEFAULT_REGION): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return canonical(value, region) ?? value;
}

/**
 * The same, applied while someone types. A `+` means they're telling us the
 * country, so the number is grouped by that country's plan as it grows; without
 * one it's grouped in the local (national) style, which carries no country code
 * — so a Brazilian number typed without its DDI is never silently turned into a
 * North American one. As soon as the input is a complete valid number it snaps
 * to the canonical form.
 */
export function formatPhoneInput(raw: string, region: CountryCode = DEFAULT_REGION): string {
  const value = raw.trimStart();
  if (!value) return '';
  const done = canonical(value, region);
  if (done) return done;
  // Partial input: AsYouType only regroups, it never adds digits of its own.
  const grouped = value.startsWith('+')
    ? new AsYouType().input(value)
    : new AsYouType(region).input(value);
  // When no local template matched, AsYouType hands back bare digits — that's a
  // number it can't place (a foreign local one, say), so keep the player's own
  // spacing instead of flattening it.
  return grouped === value.replace(/\D/g, '') ? value : grouped;
}

/** `tel:` href — E.164 (`tel:+16045551234`) for a verified number, else the digits as given. */
export function phoneHref(raw: string | null | undefined, region: CountryCode = DEFAULT_REGION): string {
  const value = (raw ?? '').trim();
  const parsed = parsePhoneNumberFromString(value, region);
  // Only a validated number earns a country code; guessing one would dial a
  // stranger in another country.
  if (parsed?.isValid()) return `tel:${parsed.number}${parsed.ext ? `;ext=${parsed.ext}` : ''}`;
  return `tel:${value.startsWith('+') ? '+' : ''}${value.replace(/\D/g, '')}`;
}
