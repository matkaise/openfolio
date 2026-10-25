"use client";

import React, { useCallback, useRef, useState } from 'react';
import { FolderOpen, Lock, Plus, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Field, IconTile, TextInput } from '@/components/ui/primitives';
import { useProjectActions } from '@/contexts/ProjectContext';
import { createDemoProject } from '@/lib/demoProject';
import { useNotifications } from '@/components/ui/notifications';

type PasswordReason = 'required' | 'invalid';

export const ProjectLauncher = () => {
  const { newProject, openProject } = useProjectActions();
  const { notify } = useNotifications();

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
        notify({ tone: 'error', title: 'Bitte ein Passwort eingeben.' });
        return;
      }
      if (password !== passwordConfirm) {
        notify({ tone: 'error', title: 'Die Passwörter stimmen nicht überein.' });
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
    <div className="theme-md3 md3-app ui-launcher">
      <div className="app-glow app-glow-1" aria-hidden="true" />
      <div className="app-glow app-glow-2" aria-hidden="true" />

      <main className="ui-launcher-card glass">
        <div className="ui-launcher-brand">
          <span className="ui-launcher-mark" aria-hidden="true"><TrendingUp size={28} /></span>
          <h1 className="ui-launcher-title">Openfolio</h1>
          <p className="ui-launcher-sub">Dein Portfolio. Deine Daten. Lokal.</p>
        </div>

        <div className="ui-options">
          <button type="button" className="ui-option" onClick={openCreateModal}>
            <IconTile tone="accent" size={48}><Plus size={22} /></IconTile>
            <span className="ui-option-text">
              <span className="ui-row-title">Neues Portfolio erstellen</span>
              <span className="ui-row-meta">Leeres Projekt, optional mit Passwort verschlüsselt</span>
            </span>
          </button>
          <button type="button" className="ui-option" onClick={handleOpenProject}>
            <IconTile tone="teal" size={48}><FolderOpen size={22} /></IconTile>
            <span className="ui-option-text">
              <span className="ui-row-title">Portfolio öffnen</span>
              <span className="ui-row-meta">.openfolio-Datei von deinem Gerät</span>
            </span>
          </button>
        </div>

        <Button variant="ghost" icon={<Sparkles size={16} />} onClick={() => void newProject({ data: createDemoProject(), fileName: 'Demo.openfolio' })}>
          Demo ansehen (Beispieldaten, ohne Konto)
        </Button>

        <p className="ui-launcher-note">
          <ShieldCheck size={14} aria-hidden="true" />
          Alle Daten bleiben auf deinem Gerät. Openfolio sendet nichts an Cloud-Server.
        </p>
      </main>

      <Modal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Neues Portfolio"
        icon={<Plus size={20} />}
        footer={(
          <>
            <Button variant="ghost" onClick={closeCreateModal}>Abbrechen</Button>
            <Button type="submit" form="create-project" variant="primary">Erstellen</Button>
          </>
        )}
      >
        <form id="create-project" className="ui-stack" onSubmit={(e) => { e.preventDefault(); submitCreateModal(); }}>
          <Field label="Projektname">
            <TextInput value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Mein Portfolio" autoFocus />
          </Field>
          <div className="ui-info-card">
            <div className="ui-row" style={{ padding: 0, marginBottom: 12 }}>
              <span className="ui-row-lead"><IconTile tone="accent" size={36}><Lock size={16} /></IconTile></span>
              <span className="ui-row-main">
                <span className="ui-row-title">Verschlüsselung (optional)</span>
                <span className="ui-row-meta">AES-256. Ohne Passwort lässt sich die Datei nicht wiederherstellen.</span>
              </span>
            </div>
            <div className="ui-grid-2">
              <Field label="Passwort">
                <TextInput type="password" autoComplete="new-password" value={projectPassword} onChange={(e) => setProjectPassword(e.target.value)} />
              </Field>
              <Field label="Passwort bestätigen">
                <TextInput type="password" autoComplete="new-password" value={projectPasswordConfirm} onChange={(e) => setProjectPasswordConfirm(e.target.value)} />
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordPromptReason)}
        onClose={() => resolvePasswordPrompt(null)}
        size="sm"
        title="Passwort eingeben"
        subtitle={passwordPromptReason === 'invalid' ? 'Falsches Passwort. Bitte erneut versuchen.' : 'Dieses Projekt ist verschlüsselt.'}
        icon={<Lock size={20} />}
        footer={(
          <>
            <Button variant="ghost" onClick={() => resolvePasswordPrompt(null)}>Abbrechen</Button>
            <Button type="submit" form="open-password" variant="primary">Öffnen</Button>
          </>
        )}
      >
        <form id="open-password" onSubmit={(e) => { e.preventDefault(); resolvePasswordPrompt(openPasswordInput); }}>
          <Field label="Passwort">
            <TextInput type="password" autoComplete="current-password" value={openPasswordInput} onChange={(e) => setOpenPasswordInput(e.target.value)} autoFocus aria-invalid={passwordPromptReason === 'invalid'} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
