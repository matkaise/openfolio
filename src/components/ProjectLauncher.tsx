"use client";

import React, { useCallback, useRef, useState } from 'react';
import { FolderOpen, Lock, Plus, TrendingUp, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

type PasswordReason = 'required' | 'invalid';

export const ProjectLauncher = () => {
  const { newProject, openProject } = useProject();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Mein Portfolio');
  const [projectPassword, setProjectPassword] = useState('');
  const [projectPasswordConfirm, setProjectPasswordConfirm] = useState('');

  const [passwordPromptReason, setPasswordPromptReason] = useState<PasswordReason | null>(null);
  const [openPasswordInput, setOpenPasswordInput] = useState('');
  const passwordResolverRef = useRef<((value: string | null) => void) | null>(null);

  const openCreateModal = () => {
    setNewProjectName('Mein Portfolio');
    setProjectPassword('');
    setProjectPasswordConfirm('');
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const submitCreateModal = () => {
    const trimmedName = newProjectName.trim() || 'Mein Portfolio';
    const password = projectPassword;
    const passwordConfirm = projectPasswordConfirm;

    if (password.length > 0 || passwordConfirm.length > 0) {
      if (!password) {
        alert('Bitte ein Passwort eingeben.');
        return;
      }
      if (password !== passwordConfirm) {
        alert('Die Passwoerter stimmen nicht ueberein.');
        return;
      }

      void newProject({ name: trimmedName, password });
      closeCreateModal();
      return;
    }

    void newProject({ name: trimmedName });
    closeCreateModal();
  };

  const requestPassword = useCallback((reason: PasswordReason): Promise<string | null> => {
    setPasswordPromptReason(reason);
    setOpenPasswordInput('');

    return new Promise((resolve) => {
      passwordResolverRef.current = resolve;
    });
  }, []);

  const resolvePasswordPrompt = (value: string | null) => {
    const resolver = passwordResolverRef.current;
    passwordResolverRef.current = null;
    setPasswordPromptReason(null);
    setOpenPasswordInput('');
    if (resolver) {
      resolver(value);
    }
  };

  const handleOpenProject = () => {
    void openProject({ requestPassword });
  };

  return (
    <div
      className="theme-md3 md3-app relative flex min-h-screen w-full items-center justify-center px-4 py-12"
    >
      <div className="app-glow app-glow-1" aria-hidden="true" />
      <div className="app-glow app-glow-2" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-xl">
        <div
          className="md3-card space-y-8 px-6 py-8 text-center md:px-8 md:py-10"
          style={{ borderRadius: 28 }}
        >
          <div className="flex flex-col items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-3xl"
              style={{
                background: 'linear-gradient(135deg, var(--c1), var(--c3))',
                color: 'oklch(0.99 0 0)',
                boxShadow: 'var(--accent-glow)'
              }}
            >
              <TrendingUp size={30} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Openfolio</h1>
              <p className="mt-2 text-sm md3-text-muted">Dein Portfolio. Deine Daten. Lokal.</p>
              <div
                className="mx-auto mt-3 h-1 w-16 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--md3-primary) 70%, white 30%)' }}
              />
            </div>
          </div>

          <div className="grid gap-4 text-left">
            <button
              type="button"
              onClick={openCreateModal}
              className="md3-list-item flex items-center gap-5 p-5 rounded-[28px]! transition-transform active:scale-[0.98]"
            >
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'var(--md3-primary-container)',
                  color: 'var(--md3-on-primary-container)'
                }}
              >
                <Plus size={24} />
              </span>
              <span className="text-base font-bold md3-text-main">Neues Portfolio erstellen</span>
            </button>

            <button
              type="button"
              onClick={handleOpenProject}
              className="md3-list-item flex items-center gap-5 p-5 rounded-[28px]! transition-transform active:scale-[0.98]"
            >
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'var(--md3-secondary-container)',
                  color: 'var(--md3-on-secondary-container)'
                }}
              >
                <FolderOpen size={24} />
              </span>
              <span className="text-base font-bold md3-text-main">Portfolio oeffnen</span>
            </button>
          </div>

          <p className="text-xs leading-relaxed md3-text-muted">
            Openfolio speichert alle Daten lokal auf deinem Geraet.
            <br />
            Es werden keine Daten an Cloud-Server gesendet.
          </p>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-4">
          <div className="md3-card w-full max-w-md rounded-3xl p-6 border" style={{ borderColor: 'var(--md3-outline)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold md3-text-main">Neues Portfolio</h3>
              </div>
              <button type="button" onClick={closeCreateModal} className="md3-icon-btn" aria-label="Schliessen">
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider md3-text-muted">Projektname</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      submitCreateModal();
                    }
                  }}
                  className="md3-field w-full px-3 py-2 text-sm outline-none"
                  placeholder="Mein Portfolio"
                />
              </div>

              <div
                className="rounded-2xl border p-3"
                style={{
                  background: 'var(--md3-surface-container-high)',
                  borderColor: 'color-mix(in srgb, var(--md3-outline) 22%, transparent 78%)'
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl"
                    style={{
                      background: 'var(--md3-primary-container)',
                      color: 'var(--md3-on-primary-container)'
                    }}
                  >
                    <Lock size={14} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold md3-text-main">Verschlüsselung</div>
                    <div className="text-xs md3-text-muted">AES-256. Ohne Passwort lässt sich die Datei nicht wiederherstellen.</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <input
                    type="password"
                    value={projectPassword}
                    onChange={(e) => setProjectPassword(e.target.value)}
                    className="md3-field w-full px-3 py-2 text-sm outline-none"
                    placeholder="Passwort (optional)"
                  />
                  <input
                    type="password"
                    value={projectPasswordConfirm}
                    onChange={(e) => setProjectPasswordConfirm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        submitCreateModal();
                      }
                    }}
                    className="md3-field w-full px-3 py-2 text-sm outline-none"
                    placeholder="Passwort bestaetigen (optional)"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeCreateModal} className="md3-text-muted px-3 py-2 text-sm font-semibold">Abbrechen</button>
              <button type="button" onClick={submitCreateModal} className="md3-filled-btn px-4 py-2 text-sm font-semibold">Erstellen</button>
            </div>
          </div>
        </div>
      )}

      {passwordPromptReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-4">
          <div className="md3-card w-full max-w-md rounded-3xl p-6 border" style={{ borderColor: 'var(--md3-outline)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold md3-text-main">Passwort eingeben</h3>
                <p className="text-xs md3-text-muted">
                  {passwordPromptReason === 'invalid'
                    ? 'Falsches Passwort. Bitte erneut versuchen.'
                    : 'Dieses Projekt braucht ein Passwort.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => resolvePasswordPrompt(null)}
                className="md3-icon-btn"
                aria-label="Schliessen"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <input
                type="password"
                value={openPasswordInput}
                onChange={(e) => setOpenPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    resolvePasswordPrompt(openPasswordInput);
                  }
                }}
                autoFocus
                className="md3-field w-full px-3 py-2 text-sm outline-none"
                placeholder="Passwort"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => resolvePasswordPrompt(null)} className="md3-text-muted px-3 py-2 text-sm font-semibold">Abbrechen</button>
              <button type="button" onClick={() => resolvePasswordPrompt(openPasswordInput)} className="md3-filled-btn px-4 py-2 text-sm font-semibold">Oeffnen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
