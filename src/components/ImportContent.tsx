import React, { useState, useMemo } from 'react';
import { Wallet, Plus, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

interface ImportContentProps {
    onContinue: (portfolioId: string, isNew: boolean, newName?: string) => void;
}

export const ImportContent = ({ onContinue }: ImportContentProps) => {
    const { project } = useProject();
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
    const [isNewPortfolio, setIsNewPortfolio] = useState(false);
    const [newPortfolioName, setNewPortfolioName] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Set default selection
    useMemo(() => {
        if (project && project.portfolios && project.portfolios.length > 0) {
            if (!selectedPortfolioId) {
                setSelectedPortfolioId(project.portfolios[0].id);
                setIsNewPortfolio(false);
            }
        } else {
            setIsNewPortfolio(true);
        }
    }, [project]);

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
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-4 mb-12">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-emerald-500/20 shadow-xl shadow-emerald-500/5">
                    <Wallet className="text-emerald-500" size={40} />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Portfolio auswählen</h2>
                    <p className="text-slate-400 mt-2 text-lg">Wähle ein bestehendes Depot oder erstelle ein neues.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Existing Portfolios List */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-300 px-1">Bestehende Portfolios</h3>
                    <div className="grid gap-3">
                        {project?.portfolios && project.portfolios.length > 0 ? (
                            project.portfolios.map(portfolio => (
                                <div
                                    key={portfolio.id}
                                    onClick={() => {
                                        setSelectedPortfolioId(portfolio.id);
                                        setIsNewPortfolio(false);
                                        setError(null);
                                    }}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group
                                        ${!isNewPortfolio && selectedPortfolioId === portfolio.id
                                            ? 'border-emerald-500 bg-emerald-500/10'
                                            : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800'}
                                    `}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-lg ${!isNewPortfolio && selectedPortfolioId === portfolio.id ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                            <Wallet size={20} />
                                        </div>
                                        <div>
                                            <h4 className={`font-bold ${!isNewPortfolio && selectedPortfolioId === portfolio.id ? 'text-white' : 'text-slate-300'}`}>
                                                {portfolio.name}
                                            </h4>
                                            {/* Could add stats here like value or count */}
                                        </div>
                                    </div>

                                    {(!isNewPortfolio && selectedPortfolioId === portfolio.id) && (
                                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center animate-in zoom-in duration-200">
                                            <CheckCircle2 size={14} className="text-white" />
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-slate-500 text-sm p-4 text-center border border-dashed border-slate-800 rounded-xl">
                                Keine bestehenden Portfolios gefunden.
                            </div>
                        )}
                    </div>
                </div>

                {/* New Portfolio Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-300 px-1">Oder neu erstellen</h3>
                    <div
                        onClick={() => setIsNewPortfolio(true)}
                        className={`relative p-6 rounded-xl border-2 transition-all cursor-pointer h-full
                            ${isNewPortfolio
                                ? 'border-emerald-500 bg-emerald-500/10'
                                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800'}
                        `}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className={`p-3 rounded-xl ${isNewPortfolio ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                <Plus size={24} />
                            </div>
                            {isNewPortfolio && (
                                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center animate-in zoom-in duration-200">
                                    <CheckCircle2 size={14} className="text-white" />
                                </div>
                            )}
                        </div>

                        <h3 className={`text-xl font-bold mb-2 ${isNewPortfolio ? 'text-white' : 'text-slate-300'}`}>
                            Neues Depot anlegen
                        </h3>
                        <p className="text-sm text-slate-400 mb-6">
                            Strategie separieren? Erstelle einfach ein weiteres Portfolio.
                        </p>

                        <div className="space-y-2">
                            <input
                                type="text"
                                value={newPortfolioName}
                                onChange={(e) => {
                                    setNewPortfolioName(e.target.value);
                                    if (error) setError(null);
                                    if (!isNewPortfolio) setIsNewPortfolio(true); // Auto-select when typing
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsNewPortfolio(true);
                                }}
                                placeholder="Name, z.B. 'ETF Sparplan'"
                                className={`w-full rounded-xl px-4 py-3 text-sm font-medium outline-none border transition-colors placeholder-slate-600
                                    ${isNewPortfolio
                                        ? 'bg-slate-900 border-emerald-500/50 text-white focus:border-emerald-500'
                                        : 'bg-slate-950 border-slate-700 text-slate-400 pointer-events-none opacity-50'}
                                    ${error ? 'border-rose-500 focus:border-rose-500' : ''}
                                `}
                            />
                            {isNewPortfolio && error && (
                                <div className="flex items-start gap-2 text-rose-400 text-sm animate-in slide-in-from-top-1">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-center pt-12">
                <button
                    onClick={handleContinue}
                    disabled={isNewPortfolio && !!error}
                    className={`group relative inline-flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all w-full md:w-auto justify-center
                        ${isNewPortfolio && error
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25 hover:scale-105 active:scale-95'}
                    `}
                >
                    <span>Weiter zum Import</span>
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
};
