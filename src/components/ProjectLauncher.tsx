"use client";

import React from 'react';
import { FolderOpen, Plus, TrendingUp } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

export const ProjectLauncher = () => {
  const { newProject, openProject } = useProject();

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
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-70 blur-3xl"
          style={{ background: 'var(--md3-gradient-a)' }}
        />
        <div
          className="absolute -bottom-28 right-[12%] h-80 w-80 rounded-full opacity-60 blur-3xl"
          style={{ background: 'var(--md3-gradient-b)' }}
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
              onClick={newProject}
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
                <span className="block text-xs md3-text-muted">Starte mit einer leeren Datenbank</span>
              </span>
            </button>

            <button
              type="button"
              onClick={openProject}
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
                <span className="block text-xs md3-text-muted">Lade eine existierende .sqlite oder .json Datei</span>
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
    </div>
  );
};
