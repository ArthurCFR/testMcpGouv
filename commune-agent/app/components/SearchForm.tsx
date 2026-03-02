"use client";

import { useState } from "react";

interface SearchFormProps {
  onSearch: (commune: string) => void;
  isLoading: boolean;
}

const SUGGESTIONS = [
  "Paris",
  "Lyon",
  "Marseille",
  "Bordeaux",
  "Nantes",
  "Montpellier",
  "Rennes",
  "Strasbourg",
];

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSearch(value.trim());
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Entrez le nom d'une commune française..."
          className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-3
            text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-colors"
          disabled={isLoading}
          autoFocus
        />
        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-200 dark:disabled:bg-zinc-700
            disabled:text-zinc-400 dark:disabled:text-zinc-500 text-white px-6 py-3 rounded-xl
            font-medium transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Analyse...
            </span>
          ) : (
            "Analyser"
          )}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((city) => (
          <button
            key={city}
            onClick={() => {
              setValue(city);
              onSearch(city);
            }}
            disabled={isLoading}
            className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700
              disabled:opacity-50 text-zinc-600 dark:text-zinc-300 px-3 py-1.5 rounded-full
              border border-zinc-200 dark:border-transparent transition-colors"
          >
            {city}
          </button>
        ))}
      </div>
    </div>
  );
}
