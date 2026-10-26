import { Activity } from 'lucide-react';
import { SimpleAreaChart } from './SimpleAreaChart';
import { Modal } from './ui/Modal';
import { EmptyState } from './ui/primitives';
import { useT } from '@/lib/i18n';

interface ReturnChartModalProps {
    isOpen: boolean;
    onClose: () => void;
    series: { date: string; value: number }[];
    title: string;
    currency: string;
    timeRange?: string;
}

export const ReturnChartModal = ({ isOpen, onClose, series, title, currency, timeRange }: ReturnChartModalProps) => {
    const t = useT();
    return (
    <Modal open={isOpen} onClose={onClose} size="xl" title={title} subtitle={t.charts.returnSubtitle} icon={<Activity size={20} />}>
        {series.length > 0 ? (
            <SimpleAreaChart data={series} currency={currency} height={320} showAxes={true} timeRange={timeRange || 'MAX'} isPercentage={true} />
        ) : (
            <EmptyState title={t.charts.emptyTitle} text={t.charts.emptyText} />
        )}
    </Modal>
    );
};
