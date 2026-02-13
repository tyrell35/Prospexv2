export interface LeadScoreResult {
  total: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  priority: 'hot' | 'warm' | 'cold';
  factors: ScoreFactor[];
  recommendation: string;
}

interface ScoreFactor {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

interface LeadInput {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  instagram_url?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  audit_score?: number | null;
  business_name?: string | null;
}

export function calculateLeadScore(lead: LeadInput): LeadScoreResult {
  const factors: ScoreFactor[] = [];
  let total = 0;

  // Factor 1: Email (25 pts)
  const emailScore = lead.email ? 25 : 0;
  factors.push({ name: 'Email Available', score: emailScore, maxScore: 25, description: lead.email ? 'Contact email found' : 'No email — harder to reach' });
  total += emailScore;

  // Factor 2: Phone (15 pts)
  const phoneScore = lead.phone ? 15 : 0;
  factors.push({ name: 'Phone Available', score: phoneScore, maxScore: 15, description: lead.phone ? 'Phone number available' : 'No phone number' });
  total += phoneScore;

  // Factor 3: Website Opportunity (25 pts — low audit = high opportunity)
  let websiteScore = 0;
  if (lead.audit_score !== undefined && lead.audit_score !== null) {
    if (lead.audit_score < 40) websiteScore = 25;
    else if (lead.audit_score < 60) websiteScore = 20;
    else if (lead.audit_score < 80) websiteScore = 12;
    else websiteScore = 5;
    factors.push({ name: 'Website Opportunity', score: websiteScore, maxScore: 25, description: lead.audit_score < 50 ? 'Poor website — high service opportunity' : 'Decent website — moderate opportunity' });
  } else if (lead.website) {
    websiteScore = 12;
    factors.push({ name: 'Website Opportunity', score: websiteScore, maxScore: 25, description: 'Has website but not yet audited' });
  } else {
    websiteScore = 18;
    factors.push({ name: 'Website Opportunity', score: websiteScore, maxScore: 25, description: 'No website — huge build opportunity' });
  }
  total += websiteScore;

  // Factor 4: Google Reviews (15 pts — low reviews = opportunity)
  let reviewScore = 0;
  if (lead.google_review_count !== null && lead.google_review_count !== undefined) {
    if (lead.google_review_count < 10) reviewScore = 15;
    else if (lead.google_review_count < 30) reviewScore = 12;
    else if (lead.google_review_count < 100) reviewScore = 8;
    else reviewScore = 4;
  }
  factors.push({ name: 'Review Opportunity', score: reviewScore, maxScore: 15, description: lead.google_review_count ? `${lead.google_review_count} reviews — ${lead.google_review_count < 30 ? 'needs review generation' : 'established presence'}` : 'No review data' });
  total += reviewScore;

  // Factor 5: Social Presence (10 pts)
  let socialScore = 0;
  if (lead.instagram_url) socialScore += 3;
  if (lead.website) socialScore += 4;
  if (lead.google_rating && lead.google_rating >= 3.0) socialScore += 3;
  factors.push({ name: 'Online Presence', score: socialScore, maxScore: 10, description: `${Math.round((socialScore / 10) * 100)}% presence detected` });
  total += socialScore;

  // Factor 6: Data Completeness (10 pts)
  let completeness = 0;
  if (lead.business_name) completeness += 2;
  if (lead.email) completeness += 3;
  if (lead.phone) completeness += 2;
  if (lead.website) completeness += 3;
  factors.push({ name: 'Data Completeness', score: completeness, maxScore: 10, description: `${Math.round((completeness / 10) * 100)}% of contact data available` });
  total += completeness;

  // Grade
  let grade: LeadScoreResult['grade'];
  if (total >= 80) grade = 'A';
  else if (total >= 65) grade = 'B';
  else if (total >= 50) grade = 'C';
  else if (total >= 35) grade = 'D';
  else grade = 'F';

  // Priority
  let priority: LeadScoreResult['priority'];
  if (total >= 70) priority = 'hot';
  else if (total >= 45) priority = 'warm';
  else priority = 'cold';

  // Recommendation
  let recommendation: string;
  if (total >= 80) recommendation = 'High-priority lead. Reach out immediately with a personalised pitch.';
  else if (total >= 65) recommendation = 'Strong lead. Send audit report and follow up within 24 hours.';
  else if (total >= 50) recommendation = 'Decent prospect. Enrich data and run website audit before outreach.';
  else if (total >= 35) recommendation = 'Needs more data. Find email or run audit to qualify further.';
  else recommendation = 'Low priority. Focus on higher-scoring leads first.';

  return { total, grade, priority, factors, recommendation };
}
