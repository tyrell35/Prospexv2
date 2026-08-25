// ═══════════════════════════════════════════════════════════════
// GOHIGHLEVEL SUB-ACCOUNT ROUTING
//
// Outbound dialling is split across two GHL sub-accounts, because
// each can only place calls in its own region:
//
//   Infinity Clients   → United Kingdom
//   Infinity CA & US   → United States + Canada
//
// A lead must therefore be pushed to — and called from — the account
// that matches its country. Dialling a UK clinic from the US account
// simply fails, so this mapping is a hard routing rule, not a hint.
//
// Credentials come from env vars and are never stored in the database.
// Each account may carry its own API key; if only the legacy shared
// GHL_API_KEY is set, both accounts fall back to it (an agency-level
// token works across locations).
// ═══════════════════════════════════════════════════════════════

export type GhlAccountKey = 'uk' | 'na';

export interface GhlAccount {
  key: GhlAccountKey;
  /** Shown in the call console so the caller knows where to dial from. */
  label: string;
  short: string;
  emoji: string;
  locationId: string;
  apiKey: string;
  /** ISO country codes this account is allowed to dial. */
  countries: string[];
  /** False when the env vars for it haven't been filled in yet. */
  configured: boolean;
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

/** Build the account table from the environment on each call — env vars
 *  can differ per deployment, and this is cheap. */
export function ghlAccounts(): GhlAccount[] {
  const sharedKey = env('GHL_API_KEY');
  const sharedLocation = env('GHL_LOCATION_ID');

  const uk: GhlAccount = {
    key: 'uk',
    label: env('GHL_UK_LABEL') || 'Infinity Clients (UK)',
    short: 'UK',
    emoji: '🇬🇧',
    // The legacy single-account vars described the UK account, so they
    // remain the UK fallback and existing behaviour is preserved.
    locationId: env('GHL_UK_LOCATION_ID') || sharedLocation,
    apiKey: env('GHL_UK_API_KEY') || sharedKey,
    countries: ['GB'],
    configured: false,
  };
  uk.configured = !!(uk.locationId && uk.apiKey);

  const na: GhlAccount = {
    key: 'na',
    label: env('GHL_NA_LABEL') || 'Infinity CA & US',
    short: 'US/CA',
    emoji: '🇺🇸',
    locationId: env('GHL_NA_LOCATION_ID'),
    apiKey: env('GHL_NA_API_KEY') || sharedKey,
    countries: ['US', 'CA'],
    configured: false,
  };
  na.configured = !!(na.locationId && na.apiKey);

  return [uk, na];
}

/** Which account is allowed to dial this country? */
export function accountForCountry(countryCode: string | null | undefined): GhlAccount | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  return ghlAccounts().find(a => a.countries.includes(cc)) || null;
}

/** Reverse lookup — used to identify which account a webhook came from. */
export function accountByLocationId(locationId: string | null | undefined): GhlAccount | null {
  if (!locationId) return null;
  return ghlAccounts().find(a => a.locationId && a.locationId === locationId) || null;
}

/**
 * Would dialling this lead from this location be wrong?
 * Returns a human-readable reason, or null when the pairing is fine.
 * An unrecognised location is not treated as a mismatch — it may simply
 * be a sub-account that hasn't been added to the env config yet.
 */
export function routingMismatch(
  countryCode: string | null | undefined,
  locationId: string | null | undefined,
): string | null {
  const expected = accountForCountry(countryCode);
  const actual = accountByLocationId(locationId);
  if (!expected || !actual) return null;
  if (expected.key === actual.key) return null;
  return `Lead is ${countryCode} which routes to ${expected.label}, but the call came from ${actual.label}.`;
}

/** Safe for the browser — labels and coverage only, never credentials. */
export interface PublicGhlAccount {
  key: GhlAccountKey;
  label: string;
  short: string;
  emoji: string;
  countries: string[];
  configured: boolean;
}

export function publicAccounts(): PublicGhlAccount[] {
  return ghlAccounts().map(({ key, label, short, emoji, countries, configured }) =>
    ({ key, label, short, emoji, countries, configured }));
}
