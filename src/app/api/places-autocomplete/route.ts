import { NextRequest, NextResponse } from 'next/server';
import { authOr401 } from '@/lib/api-auth';

// Google Places Autocomplete proxy
// Uses the Places API (New) — Autocomplete endpoint
// Requires GOOGLE_PLACES_API_KEY env var

export async function GET(request: NextRequest) {
  const _auth = await authOr401(); if (_auth instanceof Response) return _auth;
  const { searchParams } = new URL(request.url);
  const input = searchParams.get('input');
  const country = searchParams.get('country') || '';

  if (!input || input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    // Fallback: return empty results if no API key (user can still type manually)
    return NextResponse.json({ predictions: [], fallback: true });
  }

  try {
    // Map country names to ISO codes for biasing
    const countryMap: Record<string, string> = {
      'United Kingdom': 'gb', 'United States': 'us', 'Canada': 'ca', 'Australia': 'au',
      'Ireland': 'ie', 'Germany': 'de', 'France': 'fr', 'Spain': 'es', 'Italy': 'it', 'Netherlands': 'nl',
    };
    const countryCode = countryMap[country] || '';

    // Use Places Autocomplete API
    const params = new URLSearchParams({
      input,
      key: apiKey,
      types: '(regions)', // cities, neighborhoods, postal codes, sublocalities
      language: 'en',
    });

    if (countryCode) {
      params.set('components', `country:${countryCode}`);
    }

    const acResponse = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
    );

    if (!acResponse.ok) {
      throw new Error(`Google API error: ${acResponse.status}`);
    }

    const acData = await acResponse.json();

    if (acData.status !== 'OK' && acData.status !== 'ZERO_RESULTS') {
      console.error('Google Places error:', acData.status, acData.error_message);
      return NextResponse.json({ predictions: [], error: acData.status });
    }

    // Get details (lat/lng) for each prediction
    const predictions: any[] = [];

    for (const pred of (acData.predictions || []).slice(0, 6)) {
      // Get place details for lat/lng
      const detailParams = new URLSearchParams({
        place_id: pred.place_id,
        key: apiKey,
        fields: 'geometry,formatted_address,name,address_components',
      });

      const detailResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${detailParams}`
      );

      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        if (detailData.status === 'OK' && detailData.result) {
          const result = detailData.result;
          const loc = result.geometry?.location;

          // Extract city/town name from address components
          const components = result.address_components || [];
          const locality = components.find((c: { types: string[] }) =>
            c.types.includes('locality') || c.types.includes('postal_town')
          );
          const sublocality = components.find((c: { types: string[] }) =>
            c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')
          );
          const admin1 = components.find((c: { types: string[] }) =>
            c.types.includes('administrative_area_level_1')
          );
          const admin2 = components.find((c: { types: string[] }) =>
            c.types.includes('administrative_area_level_2')
          );
          const countryComp = components.find((c: { types: string[] }) =>
            c.types.includes('country')
          );

          predictions.push({
            place_id: pred.place_id,
            description: pred.description,
            formatted_address: result.formatted_address,
            name: result.name,
            // The most specific location name for the search query
            location_name: sublocality?.long_name || locality?.long_name || result.name,
            city: locality?.long_name || null,
            region: admin1?.long_name || admin2?.long_name || null,
            country_name: countryComp?.long_name || null,
            lat: loc?.lat || null,
            lng: loc?.lng || null,
          });
        }
      }
    }

    return NextResponse.json({ predictions });
  } catch (err) {
    console.error('Places autocomplete error:', err);
    return NextResponse.json({ predictions: [], error: 'Places API error' });
  }
}
