import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateLeadScore } from '@/lib/scoring';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/["']/g, '').trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += char;
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function mapFields(row: Record<string, string>): Record<string, string | null> {
  const fieldMap: Record<string, string[]> = {
    business_name: ['business_name', 'business name', 'company', 'company name', 'name', 'business'],
    email: ['email', 'email address', 'e-mail', 'contact email'],
    phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'contact phone'],
    website: ['website', 'url', 'web', 'site', 'website url', 'domain'],
    address: ['address', 'full address', 'location', 'street address', 'street'],
    city: ['city', 'town', 'area'],
    country: ['country', 'nation'],
    instagram_url: ['instagram', 'instagram_url', 'ig', 'instagram url'],
    google_rating: ['rating', 'google_rating', 'google rating', 'stars'],
    google_review_count: ['reviews', 'review_count', 'google_review_count', 'review count', 'num_reviews'],
  };

  const result: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(fieldMap)) {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== '') {
        result[field] = row[alias];
        break;
      }
    }
    if (!result[field]) result[field] = null;
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 });

    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const mapped = mapFields(row);
        if (!mapped.business_name) { errors++; continue; }

        // Check duplicate
        const { data: existing } = await supabase.from('leads').select('id').eq('business_name', mapped.business_name).maybeSingle();
        if (existing) { duplicates++; continue; }

        // Calculate score
        const scoreResult = calculateLeadScore({
          email: mapped.email,
          phone: mapped.phone,
          website: mapped.website,
          business_name: mapped.business_name,
          google_rating: mapped.google_rating ? parseFloat(mapped.google_rating) : null,
          google_review_count: mapped.google_review_count ? parseInt(mapped.google_review_count) : null,
        });

        await supabase.from('leads').insert({
          business_name: mapped.business_name,
          email: mapped.email,
          phone: mapped.phone,
          website: mapped.website,
          address: mapped.address,
          city: mapped.city,
          country: mapped.country,
          instagram_url: mapped.instagram_url,
          google_rating: mapped.google_rating ? parseFloat(mapped.google_rating) : null,
          google_review_count: mapped.google_review_count ? parseInt(mapped.google_review_count) : null,
          source: 'csv_import',
          lead_score: scoreResult.total,
          lead_grade: scoreResult.grade,
          lead_priority: scoreResult.priority,
        });

        imported++;
      } catch { errors++; }
    }

    await supabase.from('activity_log').insert({
      action_type: 'scrape',
      description: `CSV import: ${imported} imported, ${duplicates} duplicates, ${errors} errors from ${rows.length} rows`,
    });

    return NextResponse.json({ success: true, imported, duplicates, errors, total: rows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
