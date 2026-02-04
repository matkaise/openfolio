import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface MultiSelectProps {
    options: { id: string; name: string }[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    label?: string;
}

export const MultiSelectDropdown = ({ options, selectedIds, onChange, label = "Depot" }: MultiSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
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
            onChange(selectedIds.filter(prev => prev !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const toggleAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        // If "Alle" (empty) is currently active (length 0), we don't really need to do anything if clicked again?
        // Or if we click "Alle", we revert to empty array.
        onChange([]);
    };

    const isAllSelected = selectedIds.length === 0;

    const getDisplayLabel = () => {
        if (isAllSelected) return "Alle";
        if (selectedIds.length === 1) {
            return options.find(o => o.id === selectedIds[0])?.name || "Unbekannt";
        }
        return `${selectedIds.length} ausgewählt`;
    };

    return (
        <div className="relative" ref={containerRef}>
            <div
                className="flex items-center space-x-2 bg-slate-800 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-700 transition"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="text-xs text-slate-400 font-medium">{label}:</span>
                <span className="text-sm font-bold text-white ml-1">{getDisplayLabel()}</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/10">
                    <div className="p-1">
                        <div
                            onClick={toggleAll}
                            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition text-sm mb-1"
                        >
                            <span className={isAllSelected ? "text-white font-medium pl-1" : "text-slate-400 pl-1"}>Alle</span>
                            {isAllSelected && <Check size={16} className="text-emerald-500" />}
                        </div>

                        <div className="h-px bg-slate-800 mx-2 my-1" />

                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            {options.map(option => {
                                const isSelected = selectedIds.includes(option.id);
                                return (
                                    <div
                                        key={option.id}
                                        onClick={(e) => toggleOption(option.id, e)}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition text-sm"
                                    >
                                        <span className={isSelected ? "text-white font-medium pl-1" : "text-slate-300 pl-1"}>
                                            {option.name}
                                        </span>
                                        {isSelected && <Check size={16} className="text-emerald-500" />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
