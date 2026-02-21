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
      className="theme-md3 md3-app relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12"
      style={
        {
          '--md3-bg': '#f6faff',
          '--md3-on-bg': '#1a1c1e',
          '--md3-surface': '#f6faff',
          '--md3-on-surface': '#1a1c1e',
          '--md3-surface-variant': '#d4e2f5',
          '--md3-on-surface-variant': '#3e5168',
          '--md3-outline': '#7388a2',
          '--md3-primary': '#005db8',
          '--md3-on-primary': '#ffffff',
          '--md3-primary-container': '#d6e8ff',
          '--md3-on-primary-container': '#002047',
          '--md3-secondary-container': '#cfe1fb',
          '--md3-on-secondary-container': '#102844',
          '--md3-tertiary': '#6b5778',
          '--md3-on-tertiary': '#ffffff',
          '--md3-surface-container': '#ffffff',
          '--md3-surface-container-high': '#f0f6ff',
          '--md3-surface-container-highest': '#e7f0ff',
          '--md3-inverse-surface': '#2f3033',
          '--md3-inverse-primary': '#9ecaff',
          '--md3-gradient-a': 'rgba(0, 93, 184, 0.16)',
          '--md3-gradient-b': 'rgba(0, 130, 240, 0.12)',
          '--md3-orb-a': 'rgba(0, 93, 184, 0.18)',
          '--md3-orb-b': 'rgba(0, 130, 240, 0.14)'
        } as React.CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-[15%] -left-[10%] w-[70vw] h-[70vw] rounded-full opacity-80 blur-[100px] md3-blob-anim max-w-[800px] max-h-[800px]"
          style={{ background: 'var(--md3-orb-a)' }}
        />
        <div
          className="absolute top-[10%] -right-[15%] w-[60vw] h-[60vw] rounded-full opacity-80 blur-[120px] md3-blob-anim-alt max-w-[700px] max-h-[700px]"
          style={{ background: 'var(--md3-orb-b)' }}
        />
        <div
          className="absolute -bottom-[20%] left-[15%] w-[80vw] h-[80vw] rounded-full opacity-60 blur-[140px] md3-blob-anim max-w-[900px] max-h-[900px]"
          style={{ background: 'var(--md3-gradient-a)', animationDelay: '-12s', animationDuration: '24s' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-xl">
        <div
          className="md3-card space-y-8 px-6 py-8 text-center md:px-8 md:py-10"
          style={{
            border: '1px solid color-mix(in srgb, var(--md3-outline) 22%, transparent 78%)',
            boxShadow: '0 18px 38px rgba(12, 36, 66, 0.12)'
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-3xl"
              style={{
                background: 'linear-gradient(140deg, var(--md3-primary-container), color-mix(in srgb, var(--md3-primary) 14%, white 86%))',
                color: 'var(--md3-on-primary-container)',
                boxShadow: '0 10px 20px rgba(0, 93, 184, 0.18)'
              }}
            >
              <TrendingUp size={30} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">OpenParqet</h1>
              <p className="mt-2 text-sm md3-text-muted">Dein Portfolio. Deine Daten. Lokal.</p>
              <div
                className="mx-auto mt-3 h-1 w-16 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--md3-primary) 70%, white 30%)' }}
              />
            </div>
          </div>

          <div className="grid gap-3 text-left">
            <button
              type="button"
              onClick={openCreateModal}
              className="md3-list-item flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  background: 'var(--md3-primary-container)',
                  color: 'var(--md3-on-primary-container)'
                }}
              >
                <Plus size={22} />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-semibold md3-text-main">Neues Portfolio erstellen</span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenProject}
              className="md3-list-item flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  background: 'var(--md3-secondary-container)',
                  color: 'var(--md3-on-secondary-container)'
                }}
              >
                <FolderOpen size={22} />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-semibold md3-text-main">Portfolio oeffnen</span>
              </span>
            </button>
          </div>

          <p className="text-xs leading-relaxed md3-text-muted">
            OpenParqet speichert alle Daten lokal auf deinem Geraet.
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
                    <div className="text-sm font-semibold md3-text-main">Passwortschutz</div>
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
                    : 'Dieses Projekt ist passwortgeschuetzt.'}
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
