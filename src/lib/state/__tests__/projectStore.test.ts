import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { createProjectStore } from '../projectStore';

describe('project store', () => {
  it('starts without a project and ignores updates until one is loaded', () => {
    const store = createProjectStore();
    store.getState().updateProject((p) => ({ ...p, name: 'x' }));
    expect(store.getState().project).toBeNull();
    expect(store.getState().isModified).toBe(false);
  });

  it('marks real changes as modified and counts revisions', () => {
    const store = createProjectStore();
    store.getState().loadProject(createEmptyProject('A'), { fileName: 'a.openfolio', isModified: false });
    const before = store.getState().revisions.current();

    store.getState().updateProject((p) => ({ ...p, name: 'B' }));
    expect(store.getState().project?.name).toBe('B');
    expect(store.getState().isModified).toBe(true);
    expect(store.getState().revisions.current()).toBe(before + 1);

    // An updater that returns the same object is no change
    store.setState({ isModified: false });
    store.getState().updateProject((p) => p);
    expect(store.getState().isModified).toBe(false);
  });

  it('touches the project without marking it modified (save timestamp)', () => {
    const store = createProjectStore();
    store.getState().loadProject(createEmptyProject(), { isModified: false });
    store.getState().touchProject((p) => ({ ...p, modified: '2026-01-01T00:00:00.000Z' }));
    expect(store.getState().project?.modified).toBe('2026-01-01T00:00:00.000Z');
    expect(store.getState().isModified).toBe(false);
  });

  it('notifies a selector subscriber only when its slice changes', () => {
    const store = createProjectStore();
    store.getState().loadProject(createEmptyProject(), { isModified: false });
    const onProject = vi.fn();
    store.subscribe((s) => s.project, onProject);

    // Sync progress ticks must not reach components that only read the project
    store.getState().setStatus({ isMarketSyncing: true, marketSyncProgress: { current: 1, total: 4 } });
    store.getState().setStatus({ marketSyncProgress: { current: 2, total: 4 } });
    expect(onProject).not.toHaveBeenCalled();

    store.getState().updateProject((p) => ({ ...p, name: 'C' }));
    expect(onProject).toHaveBeenCalledTimes(1);
  });

  it('resets everything when the project is closed', () => {
    const store = createProjectStore();
    store.getState().loadProject(createEmptyProject(), { fileName: 'x.openfolio', encryptionStatus: 'encrypted', isModified: true });
    store.getState().closeProject();
    expect(store.getState()).toMatchObject({ project: null, fileName: null, isModified: false, encryptionStatus: 'none', lastSavedAt: null });
  });
});
