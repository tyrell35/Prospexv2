import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

interface ProblemItem {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  finding: string;
  impact: string;
  solution: string;
  timeline: string;
}

interface PitchContent {
  hook: string;
  summary: string;
  overall_score: number | null;
  problems: ProblemItem[];
  data_points: { label: string; value: string; type: 'positive' | 'negative' | 'neutral' }[];
  competitor_comparisons: { competitor_name: string; metric: string; their_value: string; your_value: string; winner: 'them' | 'you' | 'tie' }[];
  roadmap: { phase: string; timeframe: string; actions: string[] }[];
  result: string;
  cta: string;
}

// ─── COMPREHENSIVE PITCH ────────────────────────────────────────
function generateComprehensivePitch(lead: Record<string, unknown>, audit: Record<string, unknown>): PitchContent {
  const city = lead.city || 'your area';
  const name = lead.business_name as string || 'your business';
  const auditData = lead.audit_data as Record<string, unknown> | null;
  const adData = lead.ad_detection_data as Record<string, unknown> | null;

  const seoScore = (audit.seo_score as number) || 0;
  const reviewsScore = (audit.reviews_score as number) || 0;
  const aiScore = (audit.ai_visibility_score as number) || 0;
  const competitorScore = (audit.competitor_score as number) || 0;
  const overallScore = (audit.overall_score as number) || 0;

  const speedScore = (auditData?.speed_score as number) || 0;
  const mobileScore = (auditData?.mobile_score as number) || 0;
  const hasSsl = auditData?.ssl_check as boolean || false;
  const hasBooking = auditData?.has_booking as boolean || false;
  const hasChatbot = auditData?.has_chatbot as boolean || false;
  const hasVideo = auditData?.has_video as boolean || false;
  const hasSocial = auditData?.has_social_media as boolean || false;
  const hasMeta = auditData?.has_meta_description as boolean || false;
  const hasH1 = auditData?.has_h1 as boolean || false;
  const hasSchema = auditData?.has_schema as boolean || false;
  const hasAnalytics = auditData?.has_analytics as boolean || false;
  const hasClickToCall = auditData?.has_click_to_call as boolean || false;

  const rating = (lead.google_rating as number) || 0;
  const reviewCount = (lead.google_review_count as number) || 0;

  const seoData = audit.seo_data as Record<string, unknown> | null;
  const keywords = (seoData?.keywords || []) as Array<Record<string, unknown>>;
  const reviewsData = audit.reviews_data as Record<string, unknown> | null;
  const responseRate = (reviewsData?.response_rate as number) || 0;
  const aiData = audit.ai_visibility_data as Record<string, unknown> | null;
  const aiChecks = (aiData?.checks || []) as Array<Record<string, unknown>>;
  const aiMentioned = aiChecks.filter(c => c.is_mentioned).length;
  const competitors = (audit.competitor_data || []) as Array<Record<string, unknown>>;

  const adScore = (adData?.ad_score as number) || 0;
  const gAds = adData?.google_ads as Record<string, unknown> | undefined;
  const fAds = adData?.facebook_ads as Record<string, unknown> | undefined;
  const isRunningGoogle = gAds?.detected || false;
  const isRunningFacebook = fAds?.detected || false;
  const tracking = adData?.tracking_pixels as Record<string, boolean> || {};

  // ── BUILD PROBLEMS LIST ──────────────────────────────────
  const problems: ProblemItem[] = [];

  // Website Speed
  if (speedScore > 0 && speedScore < 70) {
    problems.push({
      title: `Website loads too slowly (${speedScore}/100)`,
      severity: speedScore < 30 ? 'critical' : speedScore < 50 ? 'high' : 'medium',
      finding: `Your website scored ${speedScore}/100 on Google's PageSpeed test. ${speedScore < 30 ? 'This is critically slow — over 50% of visitors will leave before your page even loads.' : speedScore < 50 ? 'This is below average. Studies show every 1-second delay in load time reduces conversions by 7%.' : 'There\'s room to improve. Faster sites rank higher on Google and convert more visitors.'}`,
      impact: `You're losing approximately ${speedScore < 30 ? '40-60%' : speedScore < 50 ? '20-35%' : '10-20%'} of potential customers who leave because your site takes too long to load. For a local business, that could mean ${speedScore < 30 ? '15-25' : speedScore < 50 ? '8-15' : '3-8'} lost enquiries per month.`,
      solution: `We'll optimise your images (compress without quality loss), implement browser caching, minify CSS/JavaScript, enable lazy loading, and move to a faster hosting provider if needed. These changes typically improve speed scores by 30-50 points.`,
      timeline: 'Week 1-2',
    });
  }

  // Mobile Score
  if (mobileScore > 0 && mobileScore < 70) {
    problems.push({
      title: `Poor mobile experience (${mobileScore}/100)`,
      severity: mobileScore < 30 ? 'critical' : 'high',
      finding: `Your site scored ${mobileScore}/100 for mobile-friendliness. ${mobileScore < 30 ? 'It\'s nearly unusable on phones.' : 'Text is too small, buttons too close together, or layout breaks on mobile.'} Over 65% of local searches happen on mobile devices.`,
      impact: `Google penalises non-mobile-friendly sites in search rankings. With ${mobileScore}/100, you're being pushed down in results while competitors with responsive sites rank above you.`,
      solution: `We'll implement a fully responsive design that looks professional on all devices — phones, tablets, and desktops. Touch-friendly buttons, readable text, fast-loading mobile images, and a mobile-first layout that makes it easy for customers to call, book, or enquire.`,
      timeline: 'Week 1-3',
    });
  }

  // SSL
  if (!hasSsl) {
    problems.push({
      title: 'No SSL certificate (site shows "Not Secure")',
      severity: 'critical',
      finding: `Your website doesn't have an SSL certificate. This means browsers display a "Not Secure" warning to every visitor. Google Chrome, which 65% of people use, shows this prominently in the address bar.`,
      impact: `82% of people will leave a website immediately when they see "Not Secure". Google also uses SSL as a ranking factor — without it, you're penalised in search results. Any contact forms on your site are sending data unencrypted, which is a GDPR compliance risk.`,
      solution: `We'll install an SSL certificate (usually free via Let's Encrypt), redirect all HTTP traffic to HTTPS, update all internal links, and ensure mixed content warnings are resolved. This is often a same-day fix.`,
      timeline: 'Day 1',
    });
  }

  // No Booking System
  if (!hasBooking) {
    problems.push({
      title: 'No online booking system',
      severity: 'high',
      finding: `Your website has no way for customers to book appointments, consultations, or services online. Visitors who want to book have to call or email — and most won't.`,
      impact: `67% of customers prefer booking online. Without a booking system, you're forcing people through an extra step that most won't take — especially outside business hours. Your competitors who offer online booking are capturing these customers instead.`,
      solution: `We'll integrate a professional booking system (Calendly, Fresha, or a custom solution) directly into your website. This includes automated confirmation emails, reminders to reduce no-shows, and calendar sync so you never double-book.`,
      timeline: 'Week 1-2',
    });
  }

  // No Chat
  if (!hasChatbot) {
    problems.push({
      title: 'No live chat or chatbot on website',
      severity: 'medium',
      finding: `Your website has no chat functionality. When a potential customer lands on your site with a quick question, there's no instant way to get an answer — so they leave.`,
      impact: `Websites with live chat see 20-40% higher conversion rates. An AI chatbot can answer FAQs, capture leads, and book appointments 24/7 — even when you're asleep.`,
      solution: `We'll set up an AI-powered chatbot trained on your services, pricing, and FAQs. It will answer common questions instantly, capture contact details from interested visitors, and hand off to your team for complex queries.`,
      timeline: 'Week 2-3',
    });
  }

  // No Video
  if (!hasVideo) {
    problems.push({
      title: 'No video content on website',
      severity: 'low',
      finding: `Your homepage has no video content. Video is the most engaging form of content — visitors spend 88% more time on pages with video.`,
      impact: `Pages with video are 53x more likely to rank on Google's first page. Without video, you're missing a powerful way to showcase your services, build trust, and differentiate from competitors.`,
      solution: `We'll produce a professional brand video showing your team, facilities, and services. This gets embedded on your homepage, used across social media, and optimised for YouTube/Google search rankings.`,
      timeline: 'Week 3-4',
    });
  }

  // Missing Click to Call
  if (!hasClickToCall) {
    problems.push({
      title: 'No click-to-call button',
      severity: 'high',
      finding: `Mobile visitors can't tap to call you directly from your website. The phone number isn't linked or there's no prominent call button.`,
      impact: `70% of mobile searchers use click-to-call. Without it, a potential customer has to manually copy your number and paste it into their dialer — most won't bother.`,
      solution: `We'll add a prominent click-to-call button in your header and a floating call button on mobile. Phone numbers will be properly linked with tel: protocol so they're tappable on every device.`,
      timeline: 'Day 1-2',
    });
  }

  // SEO Issues
  if (!hasMeta) {
    problems.push({
      title: 'Missing meta description',
      severity: 'high',
      finding: `Your website has no meta description — the snippet of text that appears under your name in Google search results. Without it, Google auto-generates one, often poorly.`,
      impact: `A well-written meta description can increase click-through rates by 30%. Without one, your Google listing looks generic and unprofessional compared to competitors who have compelling descriptions.`,
      solution: `We'll write keyword-optimised meta descriptions for every page — compelling copy that includes your location, services, and a call to action. This is one of the quickest SEO wins available.`,
      timeline: 'Week 1',
    });
  }

  if (!hasH1) {
    problems.push({
      title: 'Missing H1 heading tag',
      severity: 'medium',
      finding: `Your homepage is missing a proper H1 heading tag. This is one of the most important on-page SEO elements — it tells Google what your page is about.`,
      impact: `Without a proper H1, Google struggles to understand your page's main topic. This directly hurts your rankings for your target keywords.`,
      solution: `We'll add a keyword-rich H1 tag that clearly states what your business does and where you're located (e.g. "Leading ${lead.business_name ? 'Services' : 'Business'} in ${city}"). We'll also ensure your heading hierarchy (H1, H2, H3) is properly structured.`,
      timeline: 'Week 1',
    });
  }

  if (!hasSchema) {
    problems.push({
      title: 'No Schema markup (structured data)',
      severity: 'medium',
      finding: `Your website has no Schema.org structured data. This is the code that tells Google your business type, address, phone, opening hours, and reviews — enabling rich snippets in search results.`,
      impact: `Businesses with Schema markup get rich results in Google — star ratings, opening hours, price ranges shown directly in search. Without it, your listing looks plain compared to competitors with these enhanced features.`,
      solution: `We'll add LocalBusiness Schema markup including your name, address, phone, opening hours, services, reviews, and accepted payment methods. This often leads to richer Google search appearances within 2-4 weeks.`,
      timeline: 'Week 1-2',
    });
  }

  if (!hasAnalytics) {
    problems.push({
      title: 'No Google Analytics installed',
      severity: 'high',
      finding: `Your website has no analytics tracking. You have zero visibility into how many people visit your site, where they come from, which pages they view, or how many leave without taking action.`,
      impact: `Without analytics, you're flying blind. You can't measure what's working, what isn't, or calculate the ROI of any marketing spend. Every business decision about your website is a guess.`,
      solution: `We'll install Google Analytics 4 and Google Search Console, set up conversion tracking (calls, form submissions, bookings), and create a monthly dashboard so you can see exactly how your digital presence is performing.`,
      timeline: 'Week 1',
    });
  }

  // Reviews
  if (rating > 0 && rating < 4.5) {
    problems.push({
      title: `Google rating below industry standard (${rating.toFixed(1)}/5)`,
      severity: rating < 3.5 ? 'critical' : 'high',
      finding: `Your business has a ${rating.toFixed(1)}-star rating from ${reviewCount} reviews on Google. ${rating < 3.5 ? 'This is critically low — most consumers won\'t even consider a business under 4 stars.' : 'The industry standard for top-performing local businesses is 4.5+.'}`,
      impact: `92% of consumers read reviews before buying. A rating of ${rating.toFixed(1)} means you're losing potential customers at the very first touchpoint. ${reviewCount < 20 ? `With only ${reviewCount} reviews, even one bad review has an outsized impact on your average.` : ''}`,
      solution: `We'll implement an automated review generation system: after every service, customers receive a follow-up SMS/email asking for feedback. Happy customers are directed to Google; unhappy ones are directed to a private feedback form. We'll also respond to all existing reviews professionally — both positive and negative.`,
      timeline: 'Week 1-4 (ongoing)',
    });
  }
  if (reviewCount > 0 && reviewCount < 30) {
    problems.push({
      title: `Low review count (${reviewCount} reviews)`,
      severity: reviewCount < 10 ? 'critical' : 'high',
      finding: `You have ${reviewCount} Google reviews. ${reviewCount < 10 ? 'This is far too few to build trust with new customers.' : 'Top performers in your area typically have 50-100+ reviews.'}`,
      impact: `Businesses with 50+ reviews get significantly more clicks in Google search results. With only ${reviewCount}, you look less established and trustworthy than competitors with more reviews.`,
      solution: `Our review generation system targets 15-25 new reviews per month. We'll create touchpoints at the right moments in the customer journey, make leaving a review as easy as a single tap, and track your progress with weekly reports.`,
      timeline: 'Week 1 setup, results within 30-60 days',
    });
  }
  if (responseRate < 50 && reviewCount > 5) {
    problems.push({
      title: `Only responding to ${responseRate}% of Google reviews`,
      severity: 'medium',
      finding: `You're only responding to ${responseRate}% of your Google reviews. Google has confirmed that responding to reviews improves your local SEO rankings.`,
      impact: `Unanswered reviews signal to both Google and potential customers that you don't value feedback. Responding to reviews also gives you another opportunity to include keywords and your location naturally.`,
      solution: `We'll respond to every review within 24 hours — professional, branded responses that thank customers and naturally include relevant keywords. Negative reviews will be handled with empathy and a pathway to resolution.`,
      timeline: 'Immediate (ongoing)',
    });
  }

  // SEO Keywords
  const missingKeywords = keywords.filter(k => !k.position);
  const rankingKeywords = keywords.filter(k => k.position);
  if (missingKeywords.length > 0) {
    problems.push({
      title: `Not ranking for ${missingKeywords.length} high-value keywords`,
      severity: missingKeywords.length > 5 ? 'critical' : 'high',
      finding: `We tested ${keywords.length} search terms that potential customers in ${city} use to find businesses like yours. You're not appearing in Google results for ${missingKeywords.length} of them: ${missingKeywords.slice(0, 5).map(k => `"${k.keyword}"`).join(', ')}${missingKeywords.length > 5 ? `, and ${missingKeywords.length - 5} more` : ''}.`,
      impact: `Each missing keyword represents potential customers who are searching for exactly what you offer — but finding your competitors instead. Based on typical search volumes in ${city}, this could represent hundreds of missed opportunities per month.`,
      solution: `We'll create an SEO content strategy targeting each missing keyword: optimised landing pages, blog posts answering common questions, local content mentioning ${city} and surrounding areas, and technical SEO improvements to help Google understand your relevance.`,
      timeline: 'Month 1-3 (SEO is a long-term investment)',
    });
  }

  // AI Visibility
  if (aiChecks.length > 0 && aiMentioned < aiChecks.length * 0.5) {
    problems.push({
      title: `Invisible in AI search (mentioned ${aiMentioned}/${aiChecks.length} queries)`,
      severity: aiMentioned === 0 ? 'high' : 'medium',
      finding: `We tested ${aiChecks.length} AI search queries relevant to your business across ChatGPT, Perplexity, and Google AI. You were mentioned in only ${aiMentioned} of them. ${aiMentioned === 0 ? 'You\'re completely invisible in AI search.' : `AI only knows about you for ${aiMentioned} queries.`} Queries tested: ${aiChecks.slice(0, 4).map(c => `"${c.query}" → ${c.is_mentioned ? '✓ Mentioned' : '✗ Not found'}`).join('; ')}.`,
      impact: `800M+ people use ChatGPT weekly. Increasingly, people ask AI "what's the best ${name} in ${city}?" instead of Googling. If AI doesn't know about you, you're missing a rapidly growing discovery channel.`,
      solution: `We'll implement GEO (Generative Engine Optimisation): build authoritative citations across trusted directories, create high-quality content that AI models can reference, add structured data, and earn mentions on review sites and local blogs that AI models train on.`,
      timeline: 'Month 1-3',
    });
  }

  // No Ads
  if (adData && !isRunningGoogle && !isRunningFacebook) {
    problems.push({
      title: 'Not running any paid advertising',
      severity: 'high',
      finding: `Our ad detection scan found: no Google Ads campaigns, no Facebook/Instagram ad campaigns, ${!tracking.facebook_pixel ? 'no Facebook Pixel' : 'Facebook Pixel installed but unused'}, ${!tracking.google_tag ? 'no Google conversion tracking' : 'Google tracking present but no active campaigns'}. Your ad activity score: ${adScore}/100.`,
      impact: `You're 100% reliant on organic discovery. While organic is valuable, it's slow and unpredictable. Your competitors who are running ads are paying to appear first — stealing customers who would otherwise find you.`,
      solution: `We'll launch targeted advertising on the platforms that matter most for your business. Google Ads for people actively searching for your services in ${city}. Facebook/Instagram Ads for awareness and retargeting people who visited your website but didn't convert. We'll install proper tracking pixels so every lead is measurable.`,
      timeline: 'Week 1 setup, first leads within 48 hours',
    });
  } else if (adData && isRunningGoogle && !isRunningFacebook) {
    problems.push({
      title: 'Running Google Ads but not Facebook/Instagram',
      severity: 'medium',
      finding: `You're running Google Ads (good!) but have no Facebook or Instagram advertising. ${!tracking.facebook_pixel ? 'You don\'t even have a Facebook Pixel installed, so you can\'t retarget website visitors.' : 'You have a Facebook Pixel installed but aren\'t using it for advertising.'}`,
      impact: `People in ${city} spend 2+ hours daily on Instagram and Facebook. Without Meta advertising, you're missing out on the awareness and retargeting that turns website browsers into paying customers.`,
      solution: `We'll set up Facebook/Instagram ad campaigns targeting your ideal customer demographics in ${city}. This includes retargeting ads for people who visited your website, lookalike audiences based on your existing customers, and creative that showcases your services.`,
      timeline: 'Week 1-2',
    });
  }

  // No Social Media
  if (!hasSocial) {
    problems.push({
      title: 'No social media links on website',
      severity: 'medium',
      finding: `Your website has no links to any social media profiles. Either you don't have social accounts, or they're not connected to your website.`,
      impact: `Customers check social media to verify a business is real, active, and trustworthy. No social presence makes you look less established. Social signals also contribute to local SEO rankings.`,
      solution: `We'll set up and optimise profiles on Instagram, Facebook, and Google Business Profile. Your website will link to these, and we'll create a content calendar with weekly posts showcasing your work, client results, and behind-the-scenes content.`,
      timeline: 'Week 1-2 setup, ongoing content',
    });
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  problems.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // ── BUILD DATA POINTS ──────────────────────────────────
  const dataPoints: PitchContent['data_points'] = [];
  if (speedScore > 0) dataPoints.push({ label: 'Page Speed', value: `${speedScore}/100`, type: speedScore >= 70 ? 'positive' : 'negative' });
  if (mobileScore > 0) dataPoints.push({ label: 'Mobile Score', value: `${mobileScore}/100`, type: mobileScore >= 70 ? 'positive' : 'negative' });
  dataPoints.push({ label: 'SSL Certificate', value: hasSsl ? 'Secure ✓' : 'Not Secure ✗', type: hasSsl ? 'positive' : 'negative' });
  dataPoints.push({ label: 'Online Booking', value: hasBooking ? 'Available ✓' : 'Missing ✗', type: hasBooking ? 'positive' : 'negative' });
  if (rating > 0) dataPoints.push({ label: 'Google Rating', value: `${rating.toFixed(1)}/5 (${reviewCount} reviews)`, type: rating >= 4.5 ? 'positive' : 'negative' });
  if (seoScore > 0) dataPoints.push({ label: 'SEO Score', value: `${seoScore}/100`, type: seoScore >= 60 ? 'positive' : 'negative' });
  if (aiChecks.length > 0) dataPoints.push({ label: 'AI Visibility', value: `${aiMentioned}/${aiChecks.length} queries`, type: aiMentioned > aiChecks.length * 0.5 ? 'positive' : 'negative' });
  if (adData) dataPoints.push({ label: 'Ad Activity', value: `${adScore}/100`, type: adScore >= 50 ? 'positive' : 'negative' });

  // ── COMPETITOR TABLE ──────────────────────────────────
  const compComparisons: PitchContent['competitor_comparisons'] = [];
  for (const c of competitors.slice(0, 5)) {
    const cRating = (c.google_rating as number) || 0;
    const cReviews = (c.google_review_count as number) || 0;
    compComparisons.push({
      competitor_name: c.name as string, metric: 'Google Rating',
      their_value: cRating ? `${cRating.toFixed(1)} ★` : 'N/A', your_value: rating ? `${rating.toFixed(1)} ★` : 'N/A',
      winner: cRating > rating ? 'them' : cRating < rating ? 'you' : 'tie',
    });
    compComparisons.push({
      competitor_name: c.name as string, metric: 'Review Count',
      their_value: String(cReviews), your_value: String(reviewCount),
      winner: cReviews > reviewCount ? 'them' : cReviews < reviewCount ? 'you' : 'tie',
    });
  }

  // ── ROADMAP ───────────────────────────────────────────
  const roadmap: PitchContent['roadmap'] = [
    { phase: 'Quick Wins', timeframe: 'Week 1-2', actions: problems.filter(p => p.timeline.includes('Day') || p.timeline.includes('Week 1')).map(p => p.title) },
    { phase: 'Growth Foundation', timeframe: 'Week 2-4', actions: problems.filter(p => p.timeline.includes('Week 2') || p.timeline.includes('Week 3') || p.timeline.includes('Week 4')).map(p => p.title) },
    { phase: 'Scale & Dominate', timeframe: 'Month 2-3', actions: problems.filter(p => p.timeline.includes('Month')).map(p => p.title) },
  ].filter(r => r.actions.length > 0);

  const criticalCount = problems.filter(p => p.severity === 'critical').length;
  const highCount = problems.filter(p => p.severity === 'high').length;

  return {
    hook: `We've completed a detailed digital audit of ${name}. We found ${problems.length} issues holding your business back — ${criticalCount > 0 ? `${criticalCount} critical, ` : ''}${highCount} high priority. Here's exactly what we found, the impact on your business, and our plan to fix each one.`,
    summary: `Our comprehensive audit scored ${name} at ${overallScore || 'N/A'}/100 overall. ${criticalCount > 0 ? `There are ${criticalCount} critical issues that need immediate attention.` : ''} ${problems.length > 5 ? `We identified ${problems.length} total areas for improvement across website performance, SEO, online reputation, AI visibility, and advertising.` : `We found ${problems.length} key areas for improvement.`}`,
    overall_score: overallScore || null,
    problems,
    data_points: dataPoints,
    competitor_comparisons: compComparisons,
    roadmap,
    result: `By addressing all ${problems.length} issues, we project: ${speedScore < 70 ? 'website speed improving to 85+/100, ' : ''}${!hasBooking ? 'online bookings reducing admin time by 5+ hours/week, ' : ''}${reviewCount < 30 ? `review count growing from ${reviewCount} to 50+ within 60 days, ` : ''}${missingKeywords.length > 0 ? `visibility for ${missingKeywords.length} new keywords driving organic traffic, ` : ''}${!isRunningGoogle && !isRunningFacebook ? 'first paid leads within 48 hours of campaign launch, ' : ''}and a measurable increase in new customer enquiries within 30 days.`,
    cta: 'Book a free strategy call to discuss your personalised roadmap',
  };
}

// ─── SEO-SPECIFIC PITCH ────────────────────────────────────────
function generateSEOPitch(lead: Record<string, unknown>, audit: Record<string, unknown>): PitchContent {
  // Start with comprehensive and filter to SEO-relevant problems
  const full = generateComprehensivePitch(lead, audit);
  const seoProblems = full.problems.filter(p =>
    p.title.toLowerCase().includes('keyword') || p.title.toLowerCase().includes('seo') ||
    p.title.toLowerCase().includes('meta') || p.title.toLowerCase().includes('h1') ||
    p.title.toLowerCase().includes('schema') || p.title.toLowerCase().includes('speed') ||
    p.title.toLowerCase().includes('mobile') || p.title.toLowerCase().includes('ssl') ||
    p.title.toLowerCase().includes('analytics') || p.title.toLowerCase().includes('ai')
  );
  return { ...full, problems: seoProblems.length > 0 ? seoProblems : full.problems.slice(0, 5) };
}

// ─── REVIEWS-SPECIFIC PITCH ────────────────────────────────────
function generateReviewsPitch(lead: Record<string, unknown>, audit: Record<string, unknown>): PitchContent {
  const full = generateComprehensivePitch(lead, audit);
  const reviewProblems = full.problems.filter(p =>
    p.title.toLowerCase().includes('review') || p.title.toLowerCase().includes('rating') ||
    p.title.toLowerCase().includes('responding') || p.title.toLowerCase().includes('reputation')
  );
  return { ...full, problems: reviewProblems.length > 0 ? reviewProblems : full.problems.slice(0, 3) };
}

// ─── AI VISIBILITY PITCH ───────────────────────────────────────
function generateAIPitch(lead: Record<string, unknown>, audit: Record<string, unknown>): PitchContent {
  const full = generateComprehensivePitch(lead, audit);
  const aiProblems = full.problems.filter(p =>
    p.title.toLowerCase().includes('ai') || p.title.toLowerCase().includes('invisible') ||
    p.title.toLowerCase().includes('schema') || p.title.toLowerCase().includes('social')
  );
  return { ...full, problems: aiProblems.length > 0 ? aiProblems : full.problems.slice(0, 3) };
}

// ─── COMPETITOR PITCH ──────────────────────────────────────────
function generateCompetitorPitch(lead: Record<string, unknown>, audit: Record<string, unknown>): PitchContent {
  const full = generateComprehensivePitch(lead, audit);
  return { ...full, problems: full.problems.slice(0, 8) };
}

// ─── ADVERTISING PITCH ─────────────────────────────────────────
function generateAdvertisingPitch(lead: Record<string, unknown>, audit: Record<string, unknown>): PitchContent {
  const full = generateComprehensivePitch(lead, audit);
  const adProblems = full.problems.filter(p =>
    p.title.toLowerCase().includes('ad') || p.title.toLowerCase().includes('pixel') ||
    p.title.toLowerCase().includes('tracking') || p.title.toLowerCase().includes('facebook') ||
    p.title.toLowerCase().includes('google ads') || p.title.toLowerCase().includes('social')
  );
  return { ...full, problems: adProblems.length > 0 ? adProblems : full.problems.slice(0, 5) };
}

// ─── API HANDLER ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { leadId, deepAuditId, pitchType } = await request.json();
    if (!leadId || !pitchType) return NextResponse.json({ error: 'leadId and pitchType required' }, { status: 400 });

    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    let audit: Record<string, unknown> = {};
    if (deepAuditId) {
      const { data } = await supabase.from('deep_audits').select('*').eq('id', deepAuditId).single();
      if (data) audit = data;
    } else {
      const { data } = await supabase.from('deep_audits').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) audit = data;
    }

    const { data: settings } = await supabase.from('settings').select('agency_name, agency_email, agency_phone, agency_website, agency_logo_url, calendar_type, calendar_url').limit(1).maybeSingle();

    const generators: Record<string, (l: Record<string, unknown>, a: Record<string, unknown>) => PitchContent> = {
      seo: generateSEOPitch, reviews: generateReviewsPitch, ai_visibility: generateAIPitch,
      competitor: generateCompetitorPitch, advertising: generateAdvertisingPitch, comprehensive: generateComprehensivePitch,
    };

    const generator = generators[pitchType];
    if (!generator) return NextResponse.json({ error: 'Invalid pitch type' }, { status: 400 });

    const content = generator(lead, audit);
    const titleMap: Record<string, string> = {
      seo: `SEO Audit Report: ${lead.business_name}`,
      reviews: `Reputation Analysis: ${lead.business_name}`,
      ai_visibility: `AI Visibility Report: ${lead.business_name}`,
      competitor: `Competitive Analysis: ${lead.business_name}`,
      advertising: `Advertising Opportunity Report: ${lead.business_name}`,
      comprehensive: `Complete Digital Audit: ${lead.business_name}`,
    };

    const { data: pitch, error: pitchError } = await supabase.from('pitches').insert({
      lead_id: leadId, deep_audit_id: audit.id || null, pitch_type: pitchType,
      title: titleMap[pitchType] || `Audit Report: ${lead.business_name}`, content,
      agency_name: settings?.agency_name, agency_email: settings?.agency_email,
      agency_phone: settings?.agency_phone, agency_website: settings?.agency_website,
      agency_logo_url: settings?.agency_logo_url, calendar_type: settings?.calendar_type,
      calendar_url: settings?.calendar_url,
    }).select().single();

    if (pitchError) throw pitchError;
    await supabase.from('activity_log').insert({ action_type: 'pitch', description: `Generated ${pitchType} pitch for ${lead.business_name}`, lead_id: leadId });
    return NextResponse.json({ success: true, pitch });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Pitch generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  const pitchId = searchParams.get('pitchId');
  if (pitchId) {
    const { data } = await supabase.from('pitches').select('*').eq('id', pitchId).single();
    if (data) await supabase.from('pitches').update({ view_count: (data.view_count || 0) + 1, status: 'viewed' }).eq('id', pitchId);
    return NextResponse.json(data);
  }
  if (leadId) {
    const { data } = await supabase.from('pitches').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    return NextResponse.json(data || []);
  }
  const { data } = await supabase.from('pitches').select('*').order('created_at', { ascending: false }).limit(50);
  return NextResponse.json(data || []);
}
