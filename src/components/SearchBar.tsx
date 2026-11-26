import React, {useEffect, useRef, useState} from 'react';
import {Loader2, Search} from 'lucide-react';
import type {SteamSearchResult} from '../types/steam';

interface SearchBarProps {
  onSelectApp: (appid: number) => void;
  isLoadingApp: boolean;
  placeholder: string;
  buttonLabel: string;
  quickPicksLabel: string;
  searchingLabel: string;
}

const QUICK_PICKS = [
  {appid: 12120, label: 'GTA: San Andreas'},
  {appid: 1245620, label: 'Elden Ring'},
  {appid: 1091500, label: 'Cyberpunk 2077'},
  {appid: 300, label: 'Day of Defeat: Source'},
  {appid: 413150, label: 'Stardew Valley'},
];

export const SearchBar: React.FC<SearchBarProps> = ({
  onSelectApp,
  isLoadingApp,
  placeholder,
  buttonLabel,
  quickPicksLabel,
  searchingLabel,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SteamSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/steam/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data.items) ? data.items : []);
          setDropdownOpen(true);
        }
      } catch {
        // Ignore transient network errors during live typeahead
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const urlMatch = trimmed.match(/store\.steampowered\.com\/app\/(\d+)/i);
    if (urlMatch?.[1]) {
      setDropdownOpen(false);
      onSelectApp(Number(urlMatch[1]));
      return;
    }

    if (/^\d+$/.test(trimmed)) {
      setDropdownOpen(false);
      onSelectApp(Number(trimmed));
      return;
    }

    if (results.length > 0) {
      setDropdownOpen(false);
      onSelectApp(results[0].id);
    }
  };

  const pickResult = (item: SteamSearchResult) => {
    setQuery(`${item.name} (${item.id})`);
    setDropdownOpen(false);
    onSelectApp(item.id);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setDropdownOpen(true);
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full h-11 ps-10 pe-10 rounded-lg bg-[#111827] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/40 transition-colors"
          />
          {isSearching && (
            <Loader2
              className="w-4 h-4 text-emerald-400 animate-spin absolute end-3.5 top-1/2 -translate-y-1/2"
              aria-label={searchingLabel}
            />
          )}
        </div>
        <button
          type="submit"
          disabled={isLoadingApp || !query.trim()}
          className="h-11 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoadingApp && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{buttonLabel}</span>
        </button>
      </form>

      {dropdownOpen && results.length > 0 && (
        <div
          role="listbox"
          className="absolute z-40 mt-2 w-full rounded-lg bg-[#111827] border border-slate-700/80 shadow-xl overflow-hidden max-h-80 overflow-y-auto"
        >
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => pickResult(item)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-4 text-start hover:bg-slate-800/70 border-b border-slate-800/70 last:border-b-0 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={item.tiny_image || '/src/assets/images/generator_workspace_banner_1795649895085.jpg'}
                  alt={item.name}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = '/src/assets/images/generator_workspace_banner_1795649895085.jpg';
                  }}
                  className="w-16 h-8 object-cover rounded border border-slate-800 shrink-0 bg-slate-900"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{item.name}</div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    AppID {item.id}
                    {item.price?.final_formatted ? ` · ${item.price.final_formatted}` : ''}
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono text-emerald-400 shrink-0">#{item.id}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="text-slate-500 font-medium">{quickPicksLabel}</span>
        {QUICK_PICKS.map((item) => (
          <button
            key={item.appid}
            type="button"
            onClick={() => {
              setQuery(`${item.label} (${item.appid})`);
              setDropdownOpen(false);
              onSelectApp(item.appid);
            }}
            className="text-slate-300 hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {item.label}{' '}
            <span className="font-mono text-slate-500 tabular-nums">({item.appid})</span>
          </button>
        ))}
      </div>
    </div>
  );
};
