// ═══════════════════════════════════════════════════════
// Device → niche label mapping
//
// When a lead's website has a specific piece of aesthetic equipment
// detected in it (via hunt_enrichment.devices_found), the device tells
// us exactly what treatment category the clinic actually offers, which
// is often more reliable than the free-text `niche` field that got set
// at scrape time from a Google Places category.
//
// This map converts a device name → the canonical niche the operator
// would want to filter/target on. Used by /prospect-sweep to (a) group
// leads by their real-world niche, (b) auto-suggest a niche update on
// leads where the stored niche disagrees with what the devices imply.
//
// Adding a new device? Drop it in here so the sweep picks it up.
// ═══════════════════════════════════════════════════════

export const DEVICE_NICHE_MAP: Record<string, { niche: string; emoji: string }> = {
  // Skin tightening & RF microneedling
  'Morpheus8':                  { niche: 'skin tightening',       emoji: '🔥' },
  'Sylfirm X':                  { niche: 'skin tightening',       emoji: '🔥' },
  'Thermage FLX':               { niche: 'skin tightening',       emoji: '🔥' },
  'Sofwave':                    { niche: 'skin tightening',       emoji: '🔥' },
  'Ultherapy':                  { niche: 'skin tightening',       emoji: '🔥' },
  'Generic Radio Frequency':    { niche: 'skin tightening',       emoji: '⚡' },

  // Body sculpting / muscle building / fat
  'EMSculpt':                   { niche: 'body sculpting',        emoji: '💪' },
  'EMSculpt NEO':               { niche: 'body sculpting',        emoji: '💪' },
  'Emface':                     { niche: 'facial toning',         emoji: '💪' },
  'CoolSculpting (legacy)':     { niche: 'fat freezing',          emoji: '❄️' },
  'CoolSculpting Elite':        { niche: 'fat freezing',          emoji: '❄️' },
  'Generic Fat Freezing':       { niche: 'fat freezing',          emoji: '❄️' },
  'Generic Cavitation':         { niche: 'body contouring',       emoji: '🎯' },
  'truSculpt':                  { niche: 'body sculpting',        emoji: '💪' },

  // Lasers
  'CO2 Laser':                  { niche: 'laser resurfacing',     emoji: '🔴' },
  'Fotona':                     { niche: 'laser',                 emoji: '🔴' },
  'Sciton':                     { niche: 'laser',                 emoji: '🔴' },
  'PicoSure':                   { niche: 'laser tattoo removal',  emoji: '🔴' },
  'PicoSure Pro':               { niche: 'laser tattoo removal',  emoji: '🔴' },
  'Candela GentleMax Pro':      { niche: 'laser hair removal',    emoji: '🔴' },
  'Cutera (Excel V/truSculpt)': { niche: 'laser / vascular',      emoji: '🔴' },
  'InMode (Lumecca/Forma)':     { niche: 'IPL / RF',              emoji: '💡' },

  // Non-surgical facelift
  'HIFU (branded)':             { niche: 'non-surgical facelift', emoji: '✨' },
  'HIFU':                       { niche: 'non-surgical facelift', emoji: '✨' },

  // Facials & skin
  'HydraFacial':                { niche: 'hydrafacial',           emoji: '💧' },
  'NeoGen PSR':                 { niche: 'plasma resurfacing',    emoji: '⚡' },

  // Cryo / cold
  'Cryopen':                    { niche: 'cryotherapy',           emoji: '❄️' },
};

// Fallback niche label + icon for anything not in the map.
export const UNKNOWN_DEVICE_META = { niche: 'unclassified device', emoji: '🔬' };

/**
 * Given a list of detected devices for a single lead, pick the primary one
 * to represent the clinic. Preference: first device that's in the map
 * (since the map's ordering matches the tier importance in device_keywords).
 * Falls back to the first device string if none are recognized.
 */
export function pickPrimaryDevice(devices: string[] | null | undefined): string | null {
  if (!devices || devices.length === 0) return null;
  for (const d of devices) {
    if (DEVICE_NICHE_MAP[d]) return d;
  }
  return devices[0];
}

export function getDeviceMeta(deviceName: string): { niche: string; emoji: string } {
  return DEVICE_NICHE_MAP[deviceName] || UNKNOWN_DEVICE_META;
}

/**
 * Does the lead's stored niche field agree with what the devices imply?
 * Returns null if we can't compare (no device or no niche); otherwise
 * true = matches, false = mismatch (candidate for auto-update).
 */
export function nicheMatchesDevice(storedNiche: string | null, primaryDevice: string | null): boolean | null {
  if (!primaryDevice || !storedNiche) return null;
  const suggested = getDeviceMeta(primaryDevice).niche;
  return storedNiche.toLowerCase().includes(suggested.toLowerCase())
      || suggested.toLowerCase().includes(storedNiche.toLowerCase());
}
