"use client";

import React from 'react';
import { FolderOpen, Plus, TrendingUp } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

export const ProjectLauncher = () => {
    const { newProject, openProject } = useProject();

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Logo / Brand */}
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                        <TrendingUp size={48} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">OpenParqet</h1>
                        <p className="text-slate-400 mt-2">Dein Portfolio. Deine Daten. Lokal.</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid gap-4 mt-8">
                    <button
                        onClick={newProject}
                        className="group flex items-center p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/50 rounded-xl transition-all duration-200 text-left shadow-lg hover:shadow-emerald-500/10"
                    >
                        <div className="p-3 bg-emerald-500/10 rounded-lg mr-4 group-hover:bg-emerald-500 group-hover:text-white transition-colors text-emerald-500">
                            <Plus size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Neues Portfolio erstellen</h3>
                            <p className="text-sm text-slate-400">Starte mit einer leeren Datenbank</p>
                        </div>
                    </button>

                    <button
                        onClick={() => openProject()}
                        className="group flex items-center p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-blue-500/50 rounded-xl transition-all duration-200 text-left shadow-lg hover:shadow-blue-500/10"
                    >
                        <div className="p-3 bg-blue-500/10 rounded-lg mr-4 group-hover:bg-blue-500 group-hover:text-white transition-colors text-blue-500">
                            <FolderOpen size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Portfolio öffnen</h3>
                            <p className="text-sm text-slate-400">Lade eine existierende .json Datei</p>
                        </div>
                    </button>
                </div>

                {/* Footer Info */}
                <p className="text-xs text-slate-500 pt-8">
                    OpenParqet speichert alle Daten lokal auf deinem Gerät.<br />
                    Es werden keine Daten an Cloud-Server gesendet.
                </p>
            </div>
        </div>
    );
};
