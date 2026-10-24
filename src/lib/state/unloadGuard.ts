/**
 * beforeunload handler that makes the browser ask before closing the tab while the
 * project has unsaved changes. (Browsers show their own text; a custom message is ignored.)
 */
export const createBeforeUnloadHandler = (hasUnsavedChanges: () => boolean) => (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    // Required by older Chromium/Safari versions to trigger the dialog
    event.returnValue = '';
};
