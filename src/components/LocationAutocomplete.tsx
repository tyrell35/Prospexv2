'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LocationSelection {
  place_id: string;
  description: string;
  formatted_address: string;
  location_name: string;
  city: string | null;
  region: string | null;
  country_name: string | null;
  lat: number | null;
  lng: number | null;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (location: LocationSelection) => void;
  country?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  country = '',
  placeholder = 'e.g. Chelsea, London',
  disabled = false,
  className,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSelection[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSelection | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced fetch suggestions
  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ input, country });
      const response = await fetch(`/api/places-autocomplete?${params}`);
      const data = await response.json();

      if (data.predictions && data.predictions.length > 0) {
        setSuggestions(data.predictions);
        setIsOpen(true);
      } else if (data.fallback) {
        // No API key — don't show dropdown, let user type freely
        setSuggestions([]);
        setIsOpen(false);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [country]);

  // Handle input changes with debounce
  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    setSelectedLocation(null); // Clear selected when typing

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  // Handle selection
  const handleSelect = (suggestion: LocationSelection) => {
    setSelectedLocation(suggestion);
    // Use the most specific location name for the input display
    onChange(suggestion.location_name || suggestion.description);
    setIsOpen(false);
    if (onSelect) onSelect(suggestion);
  };

  // Clear selection
  const handleClear = () => {
    onChange('');
    setSelectedLocation(null);
    setSuggestions([]);
    if (onSelect) onSelect(null as unknown as LocationSelection);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim z-10" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { setHasFocus(true); if (suggestions.length > 0 && !selectedLocation) setIsOpen(true); }}
          onBlur={() => setHasFocus(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
            if (e.key === 'Enter' && isOpen && suggestions.length > 0) {
              e.preventDefault();
              handleSelect(suggestions[0]);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'input pl-9 pr-16',
            selectedLocation && 'border-green-500/40 bg-green-500/5',
            className
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="w-3.5 h-3.5 text-prospex-dim animate-spin" />}
          {selectedLocation && (
            <span className="flex items-center gap-1">
              <Navigation className="w-3 h-3 text-green-400" />
              <button onClick={handleClear} className="p-0.5 hover:bg-prospex-surface rounded">
                <X className="w-3 h-3 text-prospex-dim hover:text-prospex-text" />
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Coordinates indicator */}
      {selectedLocation?.lat && (
        <p className="text-[9px] text-green-500/60 font-mono mt-0.5 pl-1">
          📍 {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng?.toFixed(4)} — {selectedLocation.formatted_address}
        </p>
      )}

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#1A1A22] border border-prospex-border rounded-lg shadow-xl overflow-hidden max-h-[280px] overflow-y-auto">
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion.place_id || i}
              onClick={() => handleSelect(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-prospex-surface/80 transition-colors border-b border-prospex-border/30 last:border-0"
            >
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-prospex-text font-medium truncate">
                    {suggestion.location_name || suggestion.name}
                  </p>
                  <p className="text-[11px] text-prospex-dim truncate mt-0.5">
                    {suggestion.formatted_address || suggestion.description}
                  </p>
                  {suggestion.lat && (
                    <p className="text-[9px] text-prospex-dim/50 font-mono mt-0.5">
                      {suggestion.lat.toFixed(4)}, {suggestion.lng?.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
          <div className="px-4 py-1.5 bg-[#12121A] text-[9px] text-prospex-dim/40 font-mono text-center">
            Powered by Google Places
          </div>
        </div>
      )}

      {/* "No API key" hint if typing but no suggestions */}
      {hasFocus && value.length >= 2 && !loading && suggestions.length === 0 && !selectedLocation && !isOpen && (
        <p className="text-[9px] text-amber-500/50 font-mono mt-0.5 pl-1">
          💡 Add GOOGLE_PLACES_API_KEY in Vercel for location autocomplete
        </p>
      )}
    </div>
  );
}
