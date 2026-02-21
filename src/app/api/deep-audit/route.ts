import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getKey(envKey: string): string {
  return process.env[envKey] || '';
}

// ─── SEO Module ──────────────────────────────────────────────
async function analyzeSEO(businessName: string, location: string, website: string) {
  const login = getKey('DATAFORSEO_LOGIN');
  const password = getKey('DATAFORSEO_PASSWORD');

  if (!login || !password) {
    return { keywords: [], domain_authority: null, total_organic_keywords: null, score: 0 };
  }

  const niche = businessName.toLowerCase().includes('spa') ? 'med spa' :
    businessName.toLowerCase().includes('clinic') ? 'aesthetic clinic' :
    businessName.toLowerCase().includes('salon') ? 'beauty salon' : 'beauty';

  const keywords = [
    `${niche} ${location}`,
    `best ${niche} ${location}`,
    `${niche} near me`,
    `${niche} treatments ${location}`,
    `${niche} reviews ${location}`,
  ];

  const domain = website.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
  const results: any[] = [];

  try {
    const auth = Buffer.from(`${login}:${password}`).toString('base64');

    for (const keyword of keywords) {
      const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          keyword,
          location_name: location.includes(',') ? location : `${location}, United Kingdom`,
          language_name: 'English',
          device: 'desktop',
          depth: 30,
        }]),
      });

      const data = await response.json();
      const items = data?.tasks?.[0]?.result?.[0]?.items || [];
      const position = items.findIndex((item: any) =>
        item.domain?.includes(domain) || item.url?.includes(domain)
      );

      const serpFeatures = items
        .filter((item: any) => item.type !== 'organic')
        .map((item: any) => item.type)
        .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
        .slice(0, 3);

      results.push({
        keyword,
        position: position >= 0 ? position + 1 : null,
        search_volume: data?.tasks?.[0]?.result?.[0]?.search_information?.search_results_count || null,
        difficulty: 'medium',
        url_ranking: position >= 0 ? items[position]?.url : null,
        serp_features: serpFeatures,
      });
    }
  } catch (err) {
    console.error('DataForSEO error:', err);
  }

  // Calculate SEO score
  let score = 50; // Start neutral
  const rankingKeywords = results.filter(r => r.position !== null);
  score += rankingKeywords.length * 8; // +8 per keyword ranking
  rankingKeywords.forEach(r => {
    if (r.position <= 3) score += 5;
    else if (r.position <= 10) score += 3;
  });
  score = Math.min(100, Math.max(0, score));

  return {
    keywords: results,
    domain_authority: null,
    total_organic_keywords: rankingKeywords.length,
    score,
  };
}

// ─── Competitor Module ───────────────────────────────────────
async function analyzeCompetitors(businessName: string, niche: string, location: string) {
  const apiKey = getKey('OUTSCRAPER_API_KEY');
  if (!apiKey) return { competitors: [], score: 50 };

  try {
    const query = `${niche} ${location}`;
    const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=10&async=false`;

    const response = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
    });

    const data = await response.json();
    const results = data?.data?.[0] || [];

    // Filter out the target business and get top 3 competitors
    const competitors = results
      .filter((item: any) => item.name?.toLowerCase() !== businessName.toLowerCase())
      .slice(0, 3)
      .map((item: any, index: number) => ({
        name: item.name,
        website: item.site || null,
        address: item.full_address || null,
        google_rating: item.rating || null,
        google_review_count: item.reviews || null,
        strengths: [
          item.rating > 4.5 ? 'High rating' : null,
          item.reviews > 100 ? 'Many reviews' : null,
          item.site ? 'Has website' : null,
        ].filter(Boolean),
        weaknesses: [
          item.rating < 4.0 ? 'Low rating' : null,
          item.reviews < 20 ? 'Few reviews' : null,
          !item.site ? 'No website' : null,
        ].filter(Boolean),
        rank: index + 1,
      }));

    // Score: how does the business compare?
    const avgCompRating = competitors.reduce((s: number, c: any) => s + (c.google_rating || 0), 0) / (competitors.length || 1);
    let score = 50;
    if (competitors.length === 0) score = 70; // Less competition
    if (competitors.length >= 3) score -= 10;

    return { competitors, score: Math.max(0, Math.min(100, score)) };
  } catch (err) {
    console.error('Competitor analysis error:', err);
    return { competitors: [], score: 50 };
  }
}

// ─── Reviews Module ──────────────────────────────────────────
async function analyzeReviews(businessName: string, location: string) {
  const apiKey = getKey('OUTSCRAPER_API_KEY');
  if (!apiKey) return { data: null, score: 50 };

  try {
    const query = `${businessName} ${location}`;
    const url = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(query)}&reviewsLimit=50&sort=newest&async=false`;

    const response = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
    });

    const data = await response.json();
    const place = data?.data?.[0];

    if (!place) return { data: null, score: 50 };

    const reviews = place.reviews_data || [];
    const totalReviews = place.reviews || 0;
    const avgRating = place.rating || 0;

    // Rating distribution
    const distribution: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    reviews.forEach((r: any) => {
      const star = Math.round(r.review_rating || 0).toString();
      if (distribution[star] !== undefined) distribution[star]++;
    });

    // Owner response rate
    const withResponse = reviews.filter((r: any) => r.owner_answer).length;
    const responseRate = reviews.length > 0 ? Math.round((withResponse / reviews.length) * 100) : 0;

    // Review velocity (approximate monthly)
    const velocity = reviews.length >= 2
      ? Math.round(reviews.length / 3) // Rough: reviews in last ~3 months
      : 0;

    // Simple theme extraction from review text
    const allText = reviews.map((r: any) => r.review_text || '').join(' ').toLowerCase();
    const positiveThemes = ['friendly staff', 'great results', 'clean facility', 'professional', 'welcoming']
      .filter(t => allText.includes(t.split(' ')[0]));
    const negativeThemes = ['waiting time', 'expensive', 'rude', 'unprofessional', 'dirty']
      .filter(t => allText.includes(t.split(' ')[0]));

    // Score
    let score = 50;
    if (avgRating >= 4.5) score += 20;
    else if (avgRating >= 4.0) score += 10;
    else score -= 10;
    if (totalReviews >= 100) score += 10;
    else if (totalReviews < 20) score -= 10;
    if (responseRate >= 50) score += 10;
    if (velocity >= 5) score += 10;
    score = Math.max(0, Math.min(100, score));

    return {
      data: {
        google_rating: avgRating,
        google_review_count: totalReviews,
        review_velocity: velocity,
        response_rate: responseRate,
        avg_response_time: null,
        positive_themes: positiveThemes,
        negative_themes: negativeThemes,
        rating_distribution: distribution,
        competitor_avg_rating: null,
        competitor_avg_review_count: null,
      },
      score,
    };
  } catch (err) {
    console.error('Reviews analysis error:', err);
    return { data: null, score: 50 };
  }
}

// ─── AI Visibility Module ────────────────────────────────────
async function analyzeAIVisibility(businessName: string, location: string) {
  const openaiKey = getKey('OPENAI_API_KEY');
  if (!openaiKey) return { data: null, score: 50 };

  const queries = [
    `best med spa in ${location}`,
    `top aesthetic clinics ${location}`,
    `where to get botox in ${location}`,
  ];

  const checks: any[] = [];

  for (const query of queries) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: query,
            }
          ],
          max_tokens: 500,
        }),
      });

      const data = await response.json();
      const answer = data?.choices?.[0]?.message?.content || '';
      const mentioned = answer.toLowerCase().includes(businessName.toLowerCase());

      // Extract competitor names (basic)
      const competitorPattern = /(?:^|\n)\d+\.\s*\*?\*?([^*\n]+)/g;
      const competitors: string[] = [];
      let match;
      while ((match = competitorPattern.exec(answer)) !== null) {
        const name = match[1].trim().replace(/[*:]/g, '');
        if (name && !name.toLowerCase().includes(businessName.toLowerCase())) {
          competitors.push(name);
        }
      }

      checks.push({
        query,
        platform: 'chatgpt',
        is_mentioned: mentioned,
        mention_context: mentioned ? answer.substring(0, 200) : null,
        competitors_mentioned: competitors.slice(0, 5),
      });
    } catch (err) {
      console.error('AI visibility check error:', err);
    }
  }

  // Score
  const mentionedCount = checks.filter(c => c.is_mentioned).length;
  let score = Math.round((mentionedCount / Math.max(checks.length, 1)) * 100);

  return {
    data: {
      checks,
      robots_txt_allows_ai: null,
      has_schema_markup: null,
      has_structured_content: null,
      has_faq_schema: null,
      third_party_presence: {},
    },
    score,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { leadId } = await request.json();
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Update status
    await supabase.from('leads').update({ deep_audit_status: 'running' }).eq('id', leadId);

    const location = lead.address?.split(',').slice(-2).join(',').trim() || 'United Kingdom';
    const niche = 'med spa'; // Default niche

    // Run all modules in parallel
    const [seoResult, competitorResult, reviewsResult, aiResult] = await Promise.all([
      analyzeSEO(lead.business_name, location, lead.website || ''),
      analyzeCompetitors(lead.business_name, niche, location),
      analyzeReviews(lead.business_name, location),
      analyzeAIVisibility(lead.business_name, location),
    ]);

    // Calculate overall score
    const scores = [seoResult.score, competitorResult.score, reviewsResult.score, aiResult.score];
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Save deep audit
    const { data: deepAudit } = await supabase.from('deep_audits').insert({
      lead_id: leadId,
      overall_score: overallScore,
      seo_score: seoResult.score,
      competitor_score: competitorResult.score,
      reviews_score: reviewsResult.score,
      ai_visibility_score: aiResult.score,
      seo_data: { keywords: seoResult.keywords, domain_authority: seoResult.domain_authority, total_organic_keywords: seoResult.total_organic_keywords },
      competitor_data: competitorResult.competitors,
      reviews_data: reviewsResult.data,
      ai_visibility_data: aiResult.data,
      status: 'complete',
    }).select().single();

    // Update lead
    await supabase.from('leads').update({
      deep_audit_status: 'complete',
      deep_audit_score: overallScore,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId);

    // Log activity
    await supabase.from('activity_log').insert({
      action_type: 'deep_audit',
      description: `Deep Audit completed for ${lead.business_name} — Score: ${overallScore}/100`,
      lead_id: leadId,
    });

    return NextResponse.json({ success: true, deepAudit, overallScore });
  } catch (err: any) {
    console.error('Deep audit error:', err);
    return NextResponse.json({ error: err.message || 'Deep audit failed' }, { status: 500 });
  }
}
