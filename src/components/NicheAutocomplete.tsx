'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchNicheSuggestions, NICHE_CATEGORIES, getPopularNiches } from '@/lib/niche-suggestions';
import type { NicheSuggestion } from '@/lib/niche-suggestions';

interface NicheAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSearchTermSelect?: (searchTerm: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function NicheAutocomplete({
  value,
  onChange,
  onSearchTermSelect,
  placeholder = 'e.g. med spa, laser hair removal',
  disabled = false,
  className,
}: NicheAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<NicheSuggestion[]>([]);
  const [browsingCategory, setBrowsingCategory] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search suggestions as user types
  useEffect(() => {
    if (value.length >= 2) {
      const results = searchNicheSuggestions(value);
      setSuggestions(results);
      setBrowsingCategory(null);
    } else {
      setSuggestions([]);
    }
    setHighlightIndex(-1);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setBrowsingCategory(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectSuggestion = (s: NicheSuggestion) => {
    onChange(s.searchTerm);
    onSearchTermSelect?.(s.searchTerm);
    setIsOpen(false);
    setBrowsingCategory(null);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    const items = suggestions.length > 0 ? suggestions : [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && items[highlightIndex]) {
      e.preventDefault();
      selectSuggestion(items[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const popular = getPopularNiches();
  const showCategories = isOpen && !value && !browsingCategory;
  const showCategoryNiches = isOpen && browsingCategory;
  const showSuggestions = isOpen && suggestions.length > 0 && value.length >= 2;
  const showPopular = isOpen && !value && !browsingCategory;

  const categoryNiches = browsingCategory
    ? NICHE_CATEGORIES.find(c => c.name === browsingCategory)?.niches || []
    : [];

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="input pl-9 w-full"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-prospex-surface border border-prospex-border rounded-lg shadow-xl max-h-[380px] overflow-y-auto">

          {/* Suggestions from typing */}
          {showSuggestions && (
            <div className="py-1">
              <p className="px-3 py-1.5 text-[10px] font-mono text-prospex-dim uppercase tracking-wider">Suggested searches</p>
              {suggestions.map((s, i) => (
                <button
                  key={`${s.searchTerm}-${i}`}
                  onClick={() => selectSuggestion(s)}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-center justify-between hover:bg-prospex-cyan/10 transition-colors',
                    highlightIndex === i && 'bg-prospex-cyan/10'
                  )}
                >
                  <div>
                    <p className="text-sm text-prospex-text font-medium">{s.label}</p>
                    {s.searchTerm !== s.label.toLowerCase() && (
                      <p className="text-[10px] text-prospex-muted font-mono mt-0.5">→ searches &quot;{s.searchTerm}&quot;</p>
                    )}
                  </div>
                  <span className="text-[10px] text-prospex-dim bg-prospex-bg px-1.5 py-0.5 rounded font-mono">{s.category}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular picks when empty */}
          {showPopular && (
            <>
              <div className="py-1 border-b border-prospex-border/50">
                <p className="px-3 py-1.5 text-[10px] font-mono text-prospex-dim uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-prospex-cyan" /> Popular searches
                </p>
                <div className="grid grid-cols-2 gap-0.5 px-1.5 pb-1.5">
                  {popular.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => selectSuggestion(s)}
                      className="text-left px-2.5 py-1.5 rounded-md hover:bg-prospex-cyan/10 transition-colors"
                    >
                      <p className="text-xs text-prospex-text font-medium">{s.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Browse by category */}
          {showCategories && (
            <div className="py-1">
              <p className="px-3 py-1.5 text-[10px] font-mono text-prospex-dim uppercase tracking-wider">Browse by industry</p>
              {NICHE_CATEGORIES.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => setBrowsingCategory(cat.name)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-prospex-cyan/10 transition-colors"
                >
                  <span className="text-sm text-prospex-text">
                    <span className="mr-2">{cat.icon}</span>
                    {cat.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-prospex-dim font-mono">{cat.niches.length}</span>
                    <ChevronRight className="w-3 h-3 text-prospex-dim" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Category drill-down */}
          {showCategoryNiches && (
            <div className="py-1">
              <button
                onClick={() => setBrowsingCategory(null)}
                className="w-full text-left px-3 py-1.5 text-[10px] font-mono text-prospex-cyan uppercase tracking-wider hover:text-prospex-text transition-colors"
              >
                ← Back to categories
              </button>
              <p className="px-3 py-1 text-xs font-semibold text-prospex-text">
                {NICHE_CATEGORIES.find(c => c.name === browsingCategory)?.icon} {browsingCategory}
              </p>
              {categoryNiches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-prospex-cyan/10 transition-colors"
                >
                  <p className="text-sm text-prospex-text">{s.label}</p>
                  <p className="text-[10px] text-prospex-muted font-mono">→ &quot;{s.searchTerm}&quot;</p>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {isOpen && value.length >= 2 && suggestions.length === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-prospex-muted">No suggestions — will search &quot;{value}&quot; directly</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
