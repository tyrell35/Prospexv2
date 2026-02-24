// ─── NICHE SUGGESTIONS & KEYWORD EXPANSIONS ─────────────────────
// Maps broad niches to specific Google Maps search terms that appear
// in business names, categories, and descriptions for better accuracy.

export interface NicheSuggestion {
  label: string;           // What the user sees
  searchTerm: string;      // What gets sent to Google Maps
  category: string;        // Parent category
  tags?: string[];         // Optional tags for filtering
}

export interface NicheCategory {
  name: string;
  icon: string;
  niches: NicheSuggestion[];
}

export const NICHE_CATEGORIES: NicheCategory[] = [
  {
    name: 'Aesthetics & Med Spa',
    icon: '💉',
    niches: [
      { label: 'Med Spa', searchTerm: 'med spa', category: 'Aesthetics & Med Spa' },
      { label: 'Medical Aesthetics', searchTerm: 'medical aesthetics', category: 'Aesthetics & Med Spa' },
      { label: 'Aesthetic Clinic', searchTerm: 'aesthetic clinic', category: 'Aesthetics & Med Spa' },
      { label: 'Laser Hair Removal', searchTerm: 'laser hair removal', category: 'Aesthetics & Med Spa', tags: ['laser'] },
      { label: 'CoolSculpting / Body Contouring', searchTerm: 'body contouring', category: 'Aesthetics & Med Spa', tags: ['body'] },
      { label: 'CoolSculpting', searchTerm: 'coolsculpting', category: 'Aesthetics & Med Spa', tags: ['body'] },
      { label: 'Botox & Fillers', searchTerm: 'botox fillers', category: 'Aesthetics & Med Spa', tags: ['injectables'] },
      { label: 'Dermal Fillers', searchTerm: 'dermal fillers', category: 'Aesthetics & Med Spa', tags: ['injectables'] },
      { label: 'Anti-Wrinkle Injections', searchTerm: 'anti wrinkle injections', category: 'Aesthetics & Med Spa', tags: ['injectables'] },
      { label: 'Lip Fillers', searchTerm: 'lip fillers', category: 'Aesthetics & Med Spa', tags: ['injectables'] },
      { label: 'HydraFacial', searchTerm: 'hydrafacial', category: 'Aesthetics & Med Spa', tags: ['facial'] },
      { label: 'Chemical Peel', searchTerm: 'chemical peel', category: 'Aesthetics & Med Spa', tags: ['facial'] },
      { label: 'Microneedling', searchTerm: 'microneedling', category: 'Aesthetics & Med Spa', tags: ['facial'] },
      { label: 'PRP Treatment', searchTerm: 'PRP treatment', category: 'Aesthetics & Med Spa', tags: ['facial'] },
      { label: 'Skin Tightening', searchTerm: 'skin tightening', category: 'Aesthetics & Med Spa', tags: ['body', 'facial'] },
      { label: 'IV Drip Therapy', searchTerm: 'IV drip therapy', category: 'Aesthetics & Med Spa', tags: ['wellness'] },
      { label: 'Fat Dissolving', searchTerm: 'fat dissolving injections', category: 'Aesthetics & Med Spa', tags: ['body'] },
      { label: 'Morpheus8', searchTerm: 'morpheus8', category: 'Aesthetics & Med Spa', tags: ['facial'] },
      { label: 'Profhilo', searchTerm: 'profhilo', category: 'Aesthetics & Med Spa', tags: ['injectables'] },
      { label: 'Laser Skin Resurfacing', searchTerm: 'laser skin resurfacing', category: 'Aesthetics & Med Spa', tags: ['laser'] },
      { label: 'Tattoo Removal', searchTerm: 'laser tattoo removal', category: 'Aesthetics & Med Spa', tags: ['laser'] },
      { label: 'Thread Lift', searchTerm: 'thread lift', category: 'Aesthetics & Med Spa', tags: ['injectables'] },
      { label: 'EMSculpt / Body Sculpting', searchTerm: 'body sculpting emsculpt', category: 'Aesthetics & Med Spa', tags: ['body'] },
      { label: 'Skin Clinic', searchTerm: 'skin clinic', category: 'Aesthetics & Med Spa' },
      { label: 'Cosmetic Clinic', searchTerm: 'cosmetic clinic', category: 'Aesthetics & Med Spa' },
      { label: 'Beauty Clinic', searchTerm: 'beauty clinic', category: 'Aesthetics & Med Spa' },
    ],
  },
  {
    name: 'Hair & Beauty',
    icon: '💇',
    niches: [
      { label: 'Hair Salon', searchTerm: 'hair salon', category: 'Hair & Beauty' },
      { label: 'Barber Shop', searchTerm: 'barber shop', category: 'Hair & Beauty' },
      { label: 'Beauty Salon', searchTerm: 'beauty salon', category: 'Hair & Beauty' },
      { label: 'Nail Salon', searchTerm: 'nail salon', category: 'Hair & Beauty' },
      { label: 'Lash Extensions', searchTerm: 'lash extensions', category: 'Hair & Beauty' },
      { label: 'Brow Bar', searchTerm: 'eyebrow threading', category: 'Hair & Beauty' },
      { label: 'Waxing Salon', searchTerm: 'waxing salon', category: 'Hair & Beauty' },
      { label: 'Tanning Salon', searchTerm: 'tanning salon', category: 'Hair & Beauty' },
      { label: 'Hair Extensions', searchTerm: 'hair extensions', category: 'Hair & Beauty' },
      { label: 'Makeup Artist', searchTerm: 'makeup artist', category: 'Hair & Beauty' },
      { label: 'Microblading', searchTerm: 'microblading', category: 'Hair & Beauty' },
    ],
  },
  {
    name: 'Dental',
    icon: '🦷',
    niches: [
      { label: 'Dentist', searchTerm: 'dentist', category: 'Dental' },
      { label: 'Dental Clinic', searchTerm: 'dental clinic', category: 'Dental' },
      { label: 'Cosmetic Dentist', searchTerm: 'cosmetic dentist', category: 'Dental' },
      { label: 'Teeth Whitening', searchTerm: 'teeth whitening', category: 'Dental' },
      { label: 'Dental Implants', searchTerm: 'dental implants', category: 'Dental' },
      { label: 'Invisalign / Orthodontist', searchTerm: 'invisalign orthodontist', category: 'Dental' },
      { label: 'Emergency Dentist', searchTerm: 'emergency dentist', category: 'Dental' },
      { label: 'Veneers', searchTerm: 'dental veneers', category: 'Dental' },
      { label: 'Pediatric Dentist', searchTerm: 'pediatric dentist', category: 'Dental' },
    ],
  },
  {
    name: 'Wellness & Spa',
    icon: '🧘',
    niches: [
      { label: 'Day Spa', searchTerm: 'day spa', category: 'Wellness & Spa' },
      { label: 'Massage Therapy', searchTerm: 'massage therapy', category: 'Wellness & Spa' },
      { label: 'Yoga Studio', searchTerm: 'yoga studio', category: 'Wellness & Spa' },
      { label: 'Pilates Studio', searchTerm: 'pilates studio', category: 'Wellness & Spa' },
      { label: 'Float Therapy', searchTerm: 'float therapy', category: 'Wellness & Spa' },
      { label: 'Cryotherapy', searchTerm: 'cryotherapy', category: 'Wellness & Spa' },
      { label: 'Acupuncture', searchTerm: 'acupuncture', category: 'Wellness & Spa' },
      { label: 'Chiropractor', searchTerm: 'chiropractor', category: 'Wellness & Spa' },
      { label: 'Physiotherapy', searchTerm: 'physiotherapy clinic', category: 'Wellness & Spa' },
      { label: 'Wellness Centre', searchTerm: 'wellness centre', category: 'Wellness & Spa' },
      { label: 'Holistic Therapy', searchTerm: 'holistic therapy', category: 'Wellness & Spa' },
    ],
  },
  {
    name: 'Fitness',
    icon: '🏋️',
    niches: [
      { label: 'Gym', searchTerm: 'gym', category: 'Fitness' },
      { label: 'CrossFit', searchTerm: 'crossfit', category: 'Fitness' },
      { label: 'Personal Trainer', searchTerm: 'personal trainer', category: 'Fitness' },
      { label: 'Boxing Gym', searchTerm: 'boxing gym', category: 'Fitness' },
      { label: 'Martial Arts', searchTerm: 'martial arts', category: 'Fitness' },
      { label: 'Swimming Pool', searchTerm: 'swimming pool', category: 'Fitness' },
      { label: 'Bootcamp', searchTerm: 'fitness bootcamp', category: 'Fitness' },
      { label: 'Spin Studio', searchTerm: 'spin cycling studio', category: 'Fitness' },
    ],
  },
  {
    name: 'Home Services',
    icon: '🏠',
    niches: [
      { label: 'Plumber', searchTerm: 'plumber', category: 'Home Services' },
      { label: 'Electrician', searchTerm: 'electrician', category: 'Home Services' },
      { label: 'Roofer', searchTerm: 'roofing contractor', category: 'Home Services' },
      { label: 'HVAC', searchTerm: 'HVAC heating cooling', category: 'Home Services' },
      { label: 'Landscaping', searchTerm: 'landscaping', category: 'Home Services' },
      { label: 'Cleaning Service', searchTerm: 'cleaning service', category: 'Home Services' },
      { label: 'Pest Control', searchTerm: 'pest control', category: 'Home Services' },
      { label: 'Painter & Decorator', searchTerm: 'painter decorator', category: 'Home Services' },
      { label: 'Kitchen Fitter', searchTerm: 'kitchen fitting', category: 'Home Services' },
      { label: 'Bathroom Fitter', searchTerm: 'bathroom fitting', category: 'Home Services' },
      { label: 'Window Cleaning', searchTerm: 'window cleaning', category: 'Home Services' },
      { label: 'Locksmith', searchTerm: 'locksmith', category: 'Home Services' },
      { label: 'Garage Door', searchTerm: 'garage door repair', category: 'Home Services' },
    ],
  },
  {
    name: 'Legal & Financial',
    icon: '⚖️',
    niches: [
      { label: 'Solicitor / Lawyer', searchTerm: 'solicitor lawyer', category: 'Legal & Financial' },
      { label: 'Accountant', searchTerm: 'accountant', category: 'Legal & Financial' },
      { label: 'Financial Advisor', searchTerm: 'financial advisor', category: 'Legal & Financial' },
      { label: 'Mortgage Broker', searchTerm: 'mortgage broker', category: 'Legal & Financial' },
      { label: 'Insurance Broker', searchTerm: 'insurance broker', category: 'Legal & Financial' },
      { label: 'Estate Agent', searchTerm: 'estate agent', category: 'Legal & Financial' },
      { label: 'Tax Advisor', searchTerm: 'tax advisor', category: 'Legal & Financial' },
    ],
  },
  {
    name: 'Automotive',
    icon: '🚗',
    niches: [
      { label: 'Car Dealership', searchTerm: 'car dealership', category: 'Automotive' },
      { label: 'Auto Repair', searchTerm: 'auto repair garage', category: 'Automotive' },
      { label: 'Car Detailing', searchTerm: 'car detailing', category: 'Automotive' },
      { label: 'MOT Centre', searchTerm: 'MOT centre', category: 'Automotive' },
      { label: 'Tyre Shop', searchTerm: 'tyre shop', category: 'Automotive' },
      { label: 'Car Wash', searchTerm: 'car wash', category: 'Automotive' },
      { label: 'Auto Body Shop', searchTerm: 'auto body shop', category: 'Automotive' },
    ],
  },
  {
    name: 'Food & Hospitality',
    icon: '🍽️',
    niches: [
      { label: 'Restaurant', searchTerm: 'restaurant', category: 'Food & Hospitality' },
      { label: 'Coffee Shop / Café', searchTerm: 'coffee shop cafe', category: 'Food & Hospitality' },
      { label: 'Takeaway', searchTerm: 'takeaway', category: 'Food & Hospitality' },
      { label: 'Bakery', searchTerm: 'bakery', category: 'Food & Hospitality' },
      { label: 'Catering', searchTerm: 'catering service', category: 'Food & Hospitality' },
      { label: 'Bar / Pub', searchTerm: 'bar pub', category: 'Food & Hospitality' },
      { label: 'Hotel', searchTerm: 'hotel', category: 'Food & Hospitality' },
    ],
  },
  {
    name: 'Medical & Health',
    icon: '🏥',
    niches: [
      { label: 'GP / Doctor', searchTerm: 'GP doctor surgery', category: 'Medical & Health' },
      { label: 'Optician', searchTerm: 'optician', category: 'Medical & Health' },
      { label: 'Pharmacy', searchTerm: 'pharmacy', category: 'Medical & Health' },
      { label: 'Dermatologist', searchTerm: 'dermatologist', category: 'Medical & Health' },
      { label: 'Podiatrist', searchTerm: 'podiatrist chiropodist', category: 'Medical & Health' },
      { label: 'Veterinarian', searchTerm: 'veterinarian vet', category: 'Medical & Health' },
      { label: 'Mental Health / Therapist', searchTerm: 'therapist counselling', category: 'Medical & Health' },
      { label: 'Weight Loss Clinic', searchTerm: 'weight loss clinic', category: 'Medical & Health' },
    ],
  },
  {
    name: 'Education & Childcare',
    icon: '📚',
    niches: [
      { label: 'Nursery / Daycare', searchTerm: 'nursery daycare', category: 'Education & Childcare' },
      { label: 'Tutoring', searchTerm: 'tutoring', category: 'Education & Childcare' },
      { label: 'Dance School', searchTerm: 'dance school', category: 'Education & Childcare' },
      { label: 'Driving School', searchTerm: 'driving school', category: 'Education & Childcare' },
      { label: 'Music School', searchTerm: 'music lessons', category: 'Education & Childcare' },
    ],
  },
  {
    name: 'Pet Services',
    icon: '🐾',
    niches: [
      { label: 'Dog Groomer', searchTerm: 'dog groomer', category: 'Pet Services' },
      { label: 'Pet Shop', searchTerm: 'pet shop', category: 'Pet Services' },
      { label: 'Dog Walker', searchTerm: 'dog walker', category: 'Pet Services' },
      { label: 'Pet Boarding / Kennels', searchTerm: 'pet boarding kennels', category: 'Pet Services' },
      { label: 'Dog Training', searchTerm: 'dog training', category: 'Pet Services' },
    ],
  },
];

// Flatten all suggestions for quick search
export const ALL_SUGGESTIONS: NicheSuggestion[] = NICHE_CATEGORIES.flatMap(c => c.niches);

// Search suggestions based on typed input
export function searchNicheSuggestions(query: string, limit = 12): NicheSuggestion[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();

  // Score each suggestion by relevance
  const scored = ALL_SUGGESTIONS.map(s => {
    const label = s.label.toLowerCase();
    const search = s.searchTerm.toLowerCase();
    const category = s.category.toLowerCase();

    let score = 0;
    // Exact match = highest
    if (label === q || search === q) score = 100;
    // Starts with query
    else if (label.startsWith(q) || search.startsWith(q)) score = 80;
    // Contains query word
    else if (label.includes(q) || search.includes(q)) score = 60;
    // Category match
    else if (category.includes(q)) score = 40;
    // Word overlap
    else {
      const qWords = q.split(/\s+/);
      const matchWords = qWords.filter(w =>
        label.includes(w) || search.includes(w) || category.includes(w) ||
        (s.tags || []).some(t => t.includes(w))
      );
      if (matchWords.length > 0) score = 20 + (matchWords.length * 10);
    }

    return { suggestion: s, score };
  })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(s => s.suggestion);
}

// Get popular/recommended niches for a category
export function getNichesByCategory(categoryName: string): NicheSuggestion[] {
  const cat = NICHE_CATEGORIES.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
  return cat?.niches || [];
}

// Get the top suggested search terms for the homepage/quick picks
export function getPopularNiches(): NicheSuggestion[] {
  return [
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'med spa')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'aesthetic clinic')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'laser hair removal')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'dentist')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'hair salon')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'body contouring')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'botox fillers')!,
    ALL_SUGGESTIONS.find(s => s.searchTerm === 'skin clinic')!,
  ].filter(Boolean);
}
