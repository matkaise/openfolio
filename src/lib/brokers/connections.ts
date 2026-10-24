import { applyImportBatch, type ImportBatch, type ImportSummary } from '@/lib/importers/importBatch';
import type { BrokerConnection, ProjectData } from '@/types/domain';

const withConnections = (project: ProjectData, connections: BrokerConnection[]): ProjectData => ({
    ...project,
    settings: { ...project.settings, brokerConnections: connections }
});

export const getBrokerConnections = (project: ProjectData | null): BrokerConnection[] => (
    project?.settings.brokerConnections || []
);

export const addBrokerConnection = (project: ProjectData, connection: BrokerConnection): ProjectData => (
    withConnections(project, [...getBrokerConnections(project).filter((c) => c.id !== connection.id), connection])
);

export const removeBrokerConnection = (project: ProjectData, connectionId: string): ProjectData => (
    withConnections(project, getBrokerConnections(project).filter((c) => c.id !== connectionId))
);

export const updateBrokerConnection = (
    project: ProjectData,
    connectionId: string,
    patch: Partial<BrokerConnection>
): ProjectData => (
    withConnections(project, getBrokerConnections(project).map((c) => (c.id === connectionId ? { ...c, ...patch } : c)))
);

/** Import target for a connection; the portfolio is created if it was deleted meanwhile. */
export const connectionTarget = (project: ProjectData, connection: BrokerConnection) => {
    const portfolio = project.portfolios.find((p) => p.id === connection.portfolioId);
    return {
        id: connection.portfolioId,
        name: portfolio?.name || connection.label,
        isNew: !portfolio
    };
};

/** Applies a scanned batch and records the result on the connection. Pure. */
export const importFromConnection = (
    project: ProjectData,
    connection: BrokerConnection,
    batch: ImportBatch,
    scan: { files: string[]; newestModified: number },
    now: string
): { project: ProjectData; summary: ImportSummary } => {
    const { project: imported, summary } = applyImportBatch(project, batch, connectionTarget(project, connection));
    const updated = updateBrokerConnection(imported, connection.id, {
        lastCheckedAt: now,
        lastImportAt: now,
        lastFileModified: Math.max(connection.lastFileModified || 0, scan.newestModified),
        lastResult: {
            added: summary.addedTransactions + summary.addedMovements,
            duplicates: summary.duplicateTransactions + summary.duplicateMovements,
            files: scan.files
        }
    });
    return { project: updated, summary };
};
