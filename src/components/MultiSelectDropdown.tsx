import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface MultiSelectProps {
  options: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

export const MultiSelectDropdown = ({ options, selectedIds, onChange, label = 'Depot' }: MultiSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((prev) => prev !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  const toggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const isAllSelected = selectedIds.length === 0;

  const getDisplayLabel = () => {
    if (isAllSelected) return 'Alle';
    if (selectedIds.length === 1) {
      return options.find((o) => o.id === selectedIds[0])?.name || 'Unbekannt';
    }
    return `${selectedIds.length} ausgewaehlt`;
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        className="md3-chip flex min-h-11 items-center gap-2 px-3 text-left transition"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--md3-on-surface-variant)' }}>
          {label}
        </span>
        <span className="ml-1 text-sm font-semibold" style={{ color: 'var(--md3-on-surface)' }}>
          {getDisplayLabel()}
        </span>
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--md3-on-surface-variant)' }}
        />
      </button>

      {isOpen && (
        <div className="md3-card absolute right-0 top-full z-50 mt-2 w-64 animate-in overflow-hidden rounded-2xl p-2 duration-100 fade-in zoom-in-95">
          <div className="p-1">
            <button
              type="button"
              onClick={toggleAll}
              className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span
                className="pl-1 font-medium"
                style={{ color: isAllSelected ? 'var(--md3-on-surface)' : 'var(--md3-on-surface-variant)' }}
              >
                Alle
              </span>
              {isAllSelected && <Check size={16} style={{ color: 'var(--md3-primary)' }} />}
            </button>

            <div className="my-1 h-px md3-divider" />

            <div className="custom-scrollbar max-h-60 overflow-y-auto">
              {options.map((option) => {
                const isSelected = selectedIds.includes(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={(e) => toggleOption(option.id, e)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span
                      className="pl-1 font-medium"
                      style={{ color: isSelected ? 'var(--md3-on-surface)' : 'var(--md3-on-surface-variant)' }}
                    >
                      {option.name}
                    </span>
                    {isSelected && <Check size={16} style={{ color: 'var(--md3-primary)' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
