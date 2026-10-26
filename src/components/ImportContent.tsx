import React, { useState } from 'react';
import { Wallet, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useProjectData } from '@/contexts/ProjectContext';
import { Button, CardHeader, Field, GlassCard, IconTile, TextInput } from '@/components/ui/primitives';
import { useT } from '@/lib/i18n';

interface ImportContentProps {
    onContinue: (portfolioId: string, isNew: boolean, newName?: string) => void;
}

export const ImportContent = ({ onContinue }: ImportContentProps) => {
    const project = useProjectData();
    const t = useT();
    const initialPortfolioId = project?.portfolios?.[0]?.id || '';
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(initialPortfolioId);
    const [isNewPortfolio, setIsNewPortfolio] = useState(!(project?.portfolios && project.portfolios.length > 0));
    const [newPortfolioName, setNewPortfolioName] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Default selection is derived from the initial project state (component remounts on project change).

    // Validation
    const validateName = (name: string) => {
        if (!name.trim()) return t.importTarget.nameEmpty;
        if (project?.portfolios.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
            return t.importTarget.nameTaken;
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
            <CardHeader title={t.importTarget.title} />
            <p className="ui-text">{t.importTarget.text}</p>

            <div className="ui-options" role="radiogroup" aria-label={t.importTarget.targetLabel}>
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
                                <span className="ui-row-meta">{t.importTarget.existing}</span>
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
                            <span className="ui-row-title">{t.importTarget.newTitle}</span>
                            <span className="ui-row-meta">{t.importTarget.newText}</span>
                        </span>
                        {isNewPortfolio && <CheckCircle2 size={20} className="ui-option-check" />}
                    </button>
                    {isNewPortfolio && (
                        <Field label={t.importTarget.name} hint={error ? <span className="ui-error"><AlertCircle size={14} />{error}</span> : undefined}>
                            <TextInput
                                value={newPortfolioName}
                                onChange={(e) => {
                                    setNewPortfolioName(e.target.value);
                                    if (error) setError(null);
                                }}
                                placeholder={t.importTarget.namePlaceholder}
                                aria-invalid={!!error}
                                autoFocus={portfolios.length > 0}
                            />
                        </Field>
                    )}
                </div>
            </div>

            <div className="ui-card-foot">
                <Button variant="primary" onClick={handleContinue} disabled={isNewPortfolio && !!error}>
                    {t.importTarget.continue}
                </Button>
            </div>
        </GlassCard>
    );
};
