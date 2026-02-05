import { X, Activity } from 'lucide-react';
import { SimpleAreaChart } from './SimpleAreaChart';

interface ReturnChartModalProps {
    isOpen: boolean;
    onClose: () => void;
    series: { date: string; value: number }[];
    title: string;
    currency: string;
    timeRange?: string;
}

export const ReturnChartModal = ({ isOpen, onClose, series, title, currency, timeRange }: ReturnChartModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Activity className="text-emerald-500" />
                        {title}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <X className="text-slate-400 hover:text-white" />
                    </button>
                </div>

                <div className="h-80 w-full">
                    {series.length > 0 ? (
                        <SimpleAreaChart
                            data={series}
                            currency={currency}
                            height={320}
                            showAxes={true}
                            timeRange={timeRange || "MAX"}
                            isPercentage={true} // Force performance view
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-500">
                            Keine Daten für diesen Zeitraum verfügbar.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
