"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { useMapboxAutocomplete } from "../_hooks/useMapboxAutocomplete";

interface MapboxSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  place_type: string[];
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: MapboxSuggestion) => void;
  placeholder?: string;
  className?: string;
  showSearchButton?: boolean;
  onSearchClick?: () => void;
  searchButtonText?: string;
}

/**
 * Autocomplete input component with Mapbox geocoding suggestions
 * Provides real-time address suggestions with keyboard navigation and accessibility
 */
export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = "Enter city or address...",
  className = "",
  showSearchButton = false,
  onSearchClick,
  searchButtonText = "Search",
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { suggestions, isLoading, clearSuggestions } = useMapboxAutocomplete(
    value,
    {
      debounceMs: 300,
      minQueryLength: 2,
    },
  );

  // Show dropdown when we have suggestions and input is focused
  useEffect(() => {
    setIsOpen(
      suggestions.length > 0 && document.activeElement === inputRef.current,
    );
  }, [suggestions.length]);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding to allow for suggestion clicks
    setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleSuggestionSelect = (suggestion: MapboxSuggestion) => {
    onChange(suggestion.place_name);
    onSelect(suggestion);
    setIsOpen(false);
    clearSuggestions();
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "Enter" && onSearchClick) {
        e.preventDefault();
        onSearchClick();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSuggestionSelect(suggestions[highlightedIndex]!);
        } else if (onSearchClick) {
          onSearchClick();
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  return (
    <div className="relative">
      <div className={`flex gap-2 ${className}`}>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={isOpen ? "suggestions-listbox" : undefined}
            aria-describedby={isLoading ? "loading-indicator" : undefined}
          />

          {/* Loading indicator */}
          {isLoading && (
            <div
              id="loading-indicator"
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}

          {/* Dropdown with suggestions */}
          {isOpen && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              id="suggestions-listbox"
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                    index === highlightedIndex ? "bg-blue-50" : ""
                  }`}
                  onClick={() => handleSuggestionSelect(suggestion)}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {suggestion.text}
                    </div>
                    {suggestion.place_name !== suggestion.text && (
                      <div className="text-xs text-gray-500">
                        {suggestion.place_name}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Optional search button */}
        {showSearchButton && (
          <button
            type="button"
            onClick={onSearchClick}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Search className="h-4 w-4" />
            {searchButtonText}
          </button>
        )}
      </div>
    </div>
  );
}
