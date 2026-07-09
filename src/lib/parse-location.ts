// ═══════════════════════════════════════════════════════
// Address → city / county parser
//
// The original scraper wrote `city = <search term>` (e.g. "dorset") on
// every result in a batch, so a Google Places search for "Dorset" would
// tag Harley St, London clinics as "dorset". Fix: derive city from the
// actual returned address; fall back to the search term only if we
// don't have one.
//
// This helper MIRRORS the SQL used in the 2026-07-09 backfill migration.
// If you change one, change the other or the two data paths will diverge.
// ═══════════════════════════════════════════════════════

// Strip trailing ", Country" suffix — Google Places sometimes appends
// "United Kingdom", "United States", "Canada", etc.
const COUNTRY_SUFFIX_RE = /,\s*(United Kingdom of Great Britain and Northern Ireland|United States of America|United Kingdom|United States|Canada|UK|USA)\s*$/i;

// UK postcode at end of a line — e.g. "London NW1 6AG", "Weymouth DT4 9XP"
const UK_POSTCODE_TAIL_RE = /\s+[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\s*$/;

// Last segment is "<STATE_CODE> <ZIP>" (US) — e.g. ", NY 10023", ", MA 02116"
const US_LAST_SEGMENT_RE = /,\s*[A-Z]{2}\s+[0-9]{5}(-[0-9]{4})?\s*$/;

// Last segment is "<PROVINCE_CODE> <POSTCODE>" (Canada 2-letter) — ", ON M2R 2A5"
const CA_LAST_SEGMENT_SHORT_RE = /,\s*[A-Z]{2}\s+[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]\s*$/;

// Last segment is "<Province spelled out> <POSTCODE>" (Canada spelled) —
// e.g. ", Quebec H4A 1C8"
const CA_LAST_SEGMENT_LONG_RE = /,\s*[A-Za-z\s]+\s+[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]\s*$/;

/**
 * Parse the city out of a full street address.
 *
 * Strategy:
 *   1. Strip any trailing country suffix
 *   2. If the address ends in "STATE ZIP" (US or Canada), the second-to-last
 *      comma-separated segment is the city
 *   3. Otherwise (UK style), the LAST segment minus the postcode is the city
 *
 * @param address  Full street address (from Google Places or similar)
 * @param fallback What to return if we can't derive anything sensible
 *                  (usually the scraper's search term or null)
 */
// Title-case a city string, preserving common patterns like "St Ives",
// "Newcastle-under-Lyme", "King's Lynn" that a naive INITCAP would mangle.
// If the input is already mixed-case (e.g. "iPhone"-style), leave it alone.
function normalizeCityCase(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // If the input has any uppercase letter already, trust the source
  // (Google Places usually returns "Bournemouth" — only leave it if it
  // looks intentional).
  if (/[A-Z]/.test(trimmed) && trimmed !== trimmed.toUpperCase()) return trimmed;
  // All-lowercase or all-uppercase → title-case each word, split on space or hyphen
  return trimmed.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

export function parseCityFromAddress(address: string | null | undefined, fallback: string | null = null): string | null {
  const rawFallback = fallback ? normalizeCityCase(fallback) : fallback;
  if (!address || !address.trim()) return rawFallback;

  const clean = address.replace(COUNTRY_SUFFIX_RE, '').trim();
  if (!clean.includes(',')) {
    const stripped = clean.replace(UK_POSTCODE_TAIL_RE, '').trim();
    return stripped ? normalizeCityCase(stripped) : rawFallback;
  }

  const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return rawFallback;

  if (US_LAST_SEGMENT_RE.test(clean) || CA_LAST_SEGMENT_SHORT_RE.test(clean) || CA_LAST_SEGMENT_LONG_RE.test(clean)) {
    if (parts.length >= 2) return normalizeCityCase(parts[parts.length - 2]) || rawFallback;
  }

  const last = parts[parts.length - 1];
  const stripped = last.replace(UK_POSTCODE_TAIL_RE, '').trim();
  return stripped ? normalizeCityCase(stripped) : rawFallback;
}

// ═══════════════════════════════════════════════════════
// UK COUNTY ROLLUP
//
// "Dorset" is a county, not a city. When a user filters the /leads page
// by "Dorset", they expect Bournemouth, Poole, Dorchester, Weymouth etc.
// This map lets the filter fan out from county → list of towns to match.
//
// Adding a new county? Add its towns here. Missing towns silently reduce
// the filter's recall — no cost to being generous.
// ═══════════════════════════════════════════════════════

export const UK_COUNTY_TOWNS: Record<string, string[]> = {
  Dorset: ['Bournemouth', 'Poole', 'Dorchester', 'Weymouth', 'Christchurch', 'Wimborne', 'Blandford Forum', 'Bridport', 'Sherborne', 'Shaftesbury', 'Swanage', 'Verwood', 'Ferndown', 'Wareham', 'Gillingham'],
  Somerset: ['Wells', 'Bath', 'Taunton', 'Bridgwater', 'Yeovil', 'Frome', 'Glastonbury', 'Radstock', 'Midsomer Norton', 'Weston-super-Mare', 'Burnham-on-Sea', 'Shepton Mallet'],
  Hampshire: ['Southampton', 'Portsmouth', 'Winchester', 'Basingstoke', 'Andover', 'Aldershot', 'Farnborough', 'Fareham', 'Gosport', 'Havant', 'Eastleigh', 'Romsey', 'Lymington', 'Petersfield'],
  Devon: ['Exeter', 'Plymouth', 'Torquay', 'Paignton', 'Exmouth', 'Barnstaple', 'Newton Abbot', 'Tiverton', 'Tavistock', 'Sidmouth', 'Ilfracombe', 'Dawlish', 'Bideford', 'Honiton'],
  Cornwall: ['Truro', 'Falmouth', 'Penzance', 'St Austell', 'Newquay', 'Redruth', 'Bodmin', 'Camborne', 'St Ives', 'Bude', 'Launceston'],
  Herefordshire: ['Hereford', 'Leominster', 'Ross-on-Wye', 'Ledbury', 'Bromyard', 'Kington'],
  Worcestershire: ['Worcester', 'Kidderminster', 'Redditch', 'Bromsgrove', 'Malvern', 'Evesham', 'Droitwich Spa', 'Stourport-on-Severn'],
  Oxfordshire: ['Oxford', 'Banbury', 'Bicester', 'Witney', 'Abingdon', 'Didcot', 'Henley-on-Thames', 'Thame', 'Wallingford', 'Wantage'],
  Buckinghamshire: ['Aylesbury', 'High Wycombe', 'Milton Keynes', 'Amersham', 'Beaconsfield', 'Buckingham', 'Chesham', 'Marlow'],
  Berkshire: ['Reading', 'Slough', 'Bracknell', 'Maidenhead', 'Windsor', 'Newbury', 'Wokingham', 'Ascot'],
  Surrey: ['Guildford', 'Woking', 'Farnham', 'Redhill', 'Reigate', 'Epsom', 'Camberley', 'Weybridge', 'Esher', 'Godalming', 'Cobham', 'Dorking', 'Sutton', 'Kingston upon Thames'],
  Kent: ['Canterbury', 'Maidstone', 'Ashford', 'Tunbridge Wells', 'Dover', 'Folkestone', 'Margate', 'Ramsgate', 'Rochester', 'Chatham', 'Gillingham', 'Sevenoaks', 'Tonbridge', 'Sittingbourne'],
  Sussex: ['Brighton', 'Hove', 'Worthing', 'Eastbourne', 'Hastings', 'Chichester', 'Crawley', 'Horsham', 'Bognor Regis', 'Littlehampton', 'Lewes', 'Bexhill-on-Sea'],
  Essex: ['Chelmsford', 'Colchester', 'Southend-on-Sea', 'Basildon', 'Brentwood', 'Braintree', 'Harlow', 'Loughton', 'Romford', 'Ilford'],
  Suffolk: ['Ipswich', 'Bury St Edmunds', 'Lowestoft', 'Felixstowe', 'Sudbury', 'Newmarket', 'Woodbridge'],
  Norfolk: ['Norwich', 'Great Yarmouth', 'King\'s Lynn', 'Thetford', 'Dereham', 'Cromer', 'Wymondham'],
  Cambridgeshire: ['Cambridge', 'Peterborough', 'Ely', 'Huntingdon', 'St Neots', 'Wisbech'],
  Northamptonshire: ['Northampton', 'Kettering', 'Corby', 'Wellingborough', 'Rushden', 'Daventry', 'Brackley'],
  Leicestershire: ['Leicester', 'Loughborough', 'Hinckley', 'Melton Mowbray', 'Coalville', 'Market Harborough'],
  Nottinghamshire: ['Nottingham', 'Mansfield', 'Newark-on-Trent', 'Worksop', 'Retford', 'Beeston'],
  Derbyshire: ['Derby', 'Chesterfield', 'Buxton', 'Matlock', 'Ilkeston', 'Long Eaton', 'Belper', 'Ripley'],
  Staffordshire: ['Stoke-on-Trent', 'Stafford', 'Burton upon Trent', 'Newcastle-under-Lyme', 'Tamworth', 'Lichfield', 'Cannock'],
  Warwickshire: ['Warwick', 'Nuneaton', 'Rugby', 'Leamington Spa', 'Stratford-upon-Avon', 'Kenilworth'],
  Cheshire: ['Chester', 'Warrington', 'Crewe', 'Macclesfield', 'Runcorn', 'Widnes', 'Ellesmere Port', 'Northwich', 'Wilmslow', 'Congleton', 'Alderley Edge'],
  Lancashire: ['Preston', 'Blackpool', 'Lancaster', 'Blackburn', 'Burnley', 'Chorley', 'Rossendale', 'Fylde', 'Skelmersdale', 'Morecambe'],
  'North Yorkshire': ['York', 'Harrogate', 'Scarborough', 'Ripon', 'Northallerton', 'Skipton', 'Whitby', 'Selby', 'Malton'],
  'West Yorkshire': ['Leeds', 'Bradford', 'Wakefield', 'Huddersfield', 'Halifax', 'Dewsbury', 'Batley', 'Keighley', 'Pontefract'],
  'South Yorkshire': ['Sheffield', 'Doncaster', 'Rotherham', 'Barnsley'],
  'East Yorkshire': ['Hull', 'Beverley', 'Bridlington', 'Goole', 'Driffield'],
  Yorkshire: ['York', 'Leeds', 'Sheffield', 'Bradford', 'Wakefield', 'Hull', 'Harrogate', 'Doncaster', 'Rotherham', 'Barnsley', 'Huddersfield', 'Halifax'], // rollup of all
  'Tyne and Wear': ['Newcastle upon Tyne', 'Sunderland', 'Gateshead', 'South Shields', 'North Shields', 'Whitley Bay', 'Jarrow', 'Washington'],
  'Greater Manchester': ['Manchester', 'Salford', 'Bolton', 'Rochdale', 'Oldham', 'Stockport', 'Wigan', 'Bury', 'Ashton-under-Lyne'],
  Merseyside: ['Liverpool', 'Birkenhead', 'St Helens', 'Southport', 'Bootle', 'Wallasey'],
  'West Midlands': ['Birmingham', 'Coventry', 'Wolverhampton', 'Dudley', 'Walsall', 'West Bromwich', 'Solihull', 'Sutton Coldfield'],
};

/**
 * Given a county name (e.g. "Dorset"), return the list of towns that
 * should be considered part of that county for a rollup filter. Case
 * insensitive; unknown county → empty array.
 */
export function getUkCountyTowns(county: string): string[] {
  const key = Object.keys(UK_COUNTY_TOWNS).find(k => k.toLowerCase() === county.toLowerCase());
  return key ? UK_COUNTY_TOWNS[key] : [];
}

/**
 * Reverse lookup: given a city, which UK county does it sit in?
 * Returns null if unknown — that just means we don't have it mapped yet.
 * Used to populate the leads.county column on new scrapes.
 */
export function findCountyForCity(city: string): string | null {
  const lc = city.toLowerCase();
  for (const [county, towns] of Object.entries(UK_COUNTY_TOWNS)) {
    if (county === 'Yorkshire') continue; // Yorkshire is a rollup — prefer specific N/W/S/E when possible
    if (towns.some(t => t.toLowerCase() === lc)) return county;
  }
  // Fall back to Yorkshire rollup if the four specific ones didn't hit
  if (UK_COUNTY_TOWNS.Yorkshire.some(t => t.toLowerCase() === lc)) return 'Yorkshire';
  return null;
}
