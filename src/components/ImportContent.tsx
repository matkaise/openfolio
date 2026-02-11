import React, { useState } from 'react';
import { Wallet, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

interface ImportContentProps {
    onContinue: (portfolioId: string, isNew: boolean, newName?: string) => void;
}

export const ImportContent = ({ onContinue }: ImportContentProps) => {
    const { project } = useProject();
    const initialPortfolioId = project?.portfolios?.[0]?.id || '';
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(initialPortfolioId);
    const [isNewPortfolio, setIsNewPortfolio] = useState(!(project?.portfolios && project.portfolios.length > 0));
    const [newPortfolioName, setNewPortfolioName] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Default selection is derived from the initial project state (component remounts on project change).

    // Validation
    const validateName = (name: string) => {
        if (!name.trim()) return "Name darf nicht leer sein.";
        if (project?.portfolios.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
            return "Ein Portfolio mit diesem Namen existiert bereits.";
        }
        return null;
    };

    const handleContinue = () => {
        if (isNewPortfolio) {
            const validationError = validateName(newPortfolioName);
            if (validationError) {
                setError(validationError);
                return;
            }
            // Generate a fresh ID for the new portfolio
            const newId = crypto.randomUUID();
            onContinue(newId, true, newPortfolioName);
        } else {
            onContinue(selectedPortfolioId, false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="md3-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <h3 className="text-sm font-semibold uppercase tracking-wider md3-text-muted">Bestehende Portfolios</h3>
                        {project?.portfolios && project.portfolios.length > 0 && (
                            <span className="md3-chip-tonal rounded-full px-2.5 py-1 text-xs font-semibold">
                                {project.portfolios.length} Depot{project.portfolios.length === 1 ? '' : 's'}
                            </span>
                        )}
                    </div>
                    <div className="space-y-3">
                        {project?.portfolios && project.portfolios.length > 0 ? (
                            project.portfolios.map(portfolio => {
                                const isSelected = !isNewPortfolio && selectedPortfolioId === portfolio.id;
                                return (
                                    <button
                                        type="button"
                                        key={portfolio.id}
                                        onClick={() => {
                                            setSelectedPortfolioId(portfolio.id);
                                            setIsNewPortfolio(false);
                                            setError(null);
                                        }}
                                        className="md3-list-item w-full flex items-center justify-between gap-4 p-4 text-left transition"
                                        style={isSelected ? { background: 'var(--md3-secondary-container)', color: 'var(--md3-on-secondary-container)' } : undefined}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-10 w-10 items-center justify-center rounded-xl"
                                                style={isSelected
                                                    ? { background: 'var(--md3-primary)', color: 'var(--md3-on-primary)' }
                                                    : { background: 'var(--md3-surface-container-highest)', color: 'var(--md3-on-surface-variant)' }}
                                            >
                                                <Wallet size={18} />
                                            </div>
                                            <div>
                                                <h4
                                                    className="text-sm font-semibold"
                                                    style={{ color: isSelected ? 'var(--md3-on-secondary-container)' : 'var(--md3-on-surface)' }}
                                                >
                                                    {portfolio.name}
                                                </h4>
                                                <p
                                                    className="text-xs"
                                                    style={{ color: isSelected ? 'var(--md3-on-secondary-container)' : 'var(--md3-on-surface-variant)' }}
                                                >
                                                    Lokales Depot
                                                </p>
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <span className="md3-chip-accent inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold">
                                                <CheckCircle2 size={12} />
                                                Ausgewaehlt
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="md3-list-item p-6 text-center text-sm md3-text-muted">
                                Keine bestehenden Portfolios gefunden.
                            </div>
                        )}
                    </div>
                </div>

                <div
                    onClick={() => setIsNewPortfolio(true)}
                    className="md3-card p-6 transition"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-xl"
                                style={isNewPortfolio
                                    ? { background: 'var(--md3-primary)', color: 'var(--md3-on-primary)' }
                                    : { background: 'var(--md3-surface-container-highest)', color: 'var(--md3-on-surface-variant)' }}
                            >
                                <Plus size={18} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold md3-text-main">Neues Depot anlegen</h3>
                                <p className="text-sm md3-text-muted">Strategie separieren? Erstelle ein weiteres Portfolio.</p>
                            </div>
                        </div>
                        {isNewPortfolio && (
                            <span className="md3-chip-accent inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold">
                                <CheckCircle2 size={12} />
                                Ausgewaehlt
                            </span>
                        )}
                    </div>

                    <div className="mt-5 space-y-2">
                        <label className="md3-text-muted text-xs font-semibold uppercase tracking-wider">Portfolio-Name</label>
                        <input
                            type="text"
                            value={newPortfolioName}
                            onChange={(e) => {
                                setNewPortfolioName(e.target.value);
                                if (error) setError(null);
                                if (!isNewPortfolio) setIsNewPortfolio(true);
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsNewPortfolio(true);
                            }}
                            placeholder="Name, z.B. 'ETF Sparplan'"
                            disabled={!isNewPortfolio}
                            className={`md3-field w-full px-4 py-3 text-sm font-medium outline-none ${!isNewPortfolio ? 'opacity-60 cursor-not-allowed' : ''}`}
                            aria-invalid={!!error}
                        />
                        {isNewPortfolio && error && (
                            <div className="flex items-start gap-2 text-sm md3-negative">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    type="button"
                    onClick={handleContinue}
                    disabled={isNewPortfolio && !!error}
                    className="md3-filled-btn px-6 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    Weiter zum Import
                </button>
            </div>
        </div>
    );
};

