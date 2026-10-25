import React, { useState } from 'react';
import { Wallet, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useProjectData } from '@/contexts/ProjectContext';
import { Button, CardHeader, Field, GlassCard, IconTile, TextInput } from '@/components/ui/primitives';

interface ImportContentProps {
    onContinue: (portfolioId: string, isNew: boolean, newName?: string) => void;
}

export const ImportContent = ({ onContinue }: ImportContentProps) => {
    const project = useProjectData();
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

    const portfolios = project?.portfolios || [];

    return (
        <GlassCard className="ui-narrow">
            <CardHeader title="In welches Depot importieren?" />
            <p className="ui-text">Wähle ein bestehendes Depot oder lege ein neues an. Im nächsten Schritt lädst du die Datei hoch oder erfasst Buchungen manuell.</p>

            <div className="ui-options" role="radiogroup" aria-label="Ziel-Depot">
                {portfolios.map((portfolio) => {
                    const isSelected = !isNewPortfolio && selectedPortfolioId === portfolio.id;
                    return (
                        <button
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            key={portfolio.id}
                            className="ui-option"
                            onClick={() => {
                                setSelectedPortfolioId(portfolio.id);
                                setIsNewPortfolio(false);
                                setError(null);
                            }}
                        >
                            <IconTile tone={isSelected ? 'accent' : 'neutral'}><Wallet size={18} /></IconTile>
                            <span className="ui-option-text">
                                <span className="ui-row-title">{portfolio.name}</span>
                                <span className="ui-row-meta">Bestehendes Depot</span>
                            </span>
                            {isSelected && <CheckCircle2 size={20} className="ui-option-check" />}
                        </button>
                    );
                })}

                <div className={`ui-option is-form${isNewPortfolio ? ' is-selected' : ''}`}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={isNewPortfolio}
                        className="ui-option-head"
                        onClick={() => setIsNewPortfolio(true)}
                    >
                        <IconTile tone={isNewPortfolio ? 'accent' : 'neutral'}><Plus size={18} /></IconTile>
                        <span className="ui-option-text">
                            <span className="ui-row-title">Neues Depot anlegen</span>
                            <span className="ui-row-meta">Zum Beispiel für einen zweiten Broker oder eine eigene Strategie</span>
                        </span>
                        {isNewPortfolio && <CheckCircle2 size={20} className="ui-option-check" />}
                    </button>
                    {isNewPortfolio && (
                        <Field label="Name des Depots" hint={error ? <span className="ui-error"><AlertCircle size={14} />{error}</span> : undefined}>
                            <TextInput
                                value={newPortfolioName}
                                onChange={(e) => {
                                    setNewPortfolioName(e.target.value);
                                    if (error) setError(null);
                                }}
                                placeholder="z. B. ETF-Sparplan"
                                aria-invalid={!!error}
                                autoFocus={portfolios.length > 0}
                            />
                        </Field>
                    )}
                </div>
            </div>

            <div className="ui-card-foot">
                <Button variant="primary" onClick={handleContinue} disabled={isNewPortfolio && !!error}>
                    Weiter zum Import
                </Button>
            </div>
        </GlassCard>
    );
};
