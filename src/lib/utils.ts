import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-prospex-green';
  if (score >= 60) return 'text-prospex-cyan';
  if (score >= 40) return 'text-prospex-amber';
  return 'text-prospex-red';
}

export function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-prospex-green/20 border-prospex-green/40';
  if (score >= 60) return 'bg-prospex-cyan/20 border-prospex-cyan/40';
  if (score >= 40) return 'bg-prospex-amber/20 border-prospex-amber/40';
  return 'bg-prospex-red/20 border-prospex-red/40';
}

export function getSourceConfig(source: string): { label: string; color: string } {
  const configs: Record<string, { label: string; color: string }> = {
    google_maps: { label: 'Google Maps', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
    yelp: { label: 'Yelp', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
    fresha: { label: 'Fresha', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
    yell: { label: 'Yell.com', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
    yellow_pages: { label: 'Yellow Pages', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
    bing_places: { label: 'Bing Places', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' },
    bark: { label: 'Bark.com', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
    csv_import: { label: 'CSV Import', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' },
  };
  return configs[source] || { label: source, color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
}

export function getPriorityConfig(priority: string): { label: string; emoji: string; bg: string; text: string; border: string } {
  const configs: Record<string, { label: string; emoji: string; bg: string; text: string; border: string }> = {
    hot: { label: 'Hot', emoji: '🔥', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' },
    warm: { label: 'Warm', emoji: '☀️', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' },
    cold: { label: 'Cold', emoji: '❄️', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40' },
  };
  return configs[priority] || configs.cold;
}

export function getGradeFromScore(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function getPriorityFromScore(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 45) return 'warm';
  return 'cold';
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}

export function getWhatsAppUrl(phone: string, message?: string): string {
  const cleaned = cleanPhone(phone).replace('+', '');
  const msg = message || 'Hi, I came across your business and wanted to reach out.';
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`;
}

export function getInstagramDMUrl(instagramUrl: string): string {
  const handle = instagramUrl.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '');
  return `https://ig.me/m/${handle}`;
}

// Aliases for backward compatibility
export const getScoreBgColor = getScoreBg;
export const getGrade = getGradeFromScore;

export const PIPELINE_STAGES = [
  { id: 'new', label: 'New Lead', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  { id: 'pitched', label: 'Pitched', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  { id: 'booked', label: 'Booked', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  { id: 'closed', label: 'Closed Won', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
];
