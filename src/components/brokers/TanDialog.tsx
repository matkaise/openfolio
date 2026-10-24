"use client";

import React, { useState } from 'react';
import { KeyRound, Smartphone, X } from 'lucide-react';
import { useBrokerSync } from './BrokerSyncContext';

const isPngBase64 = (value?: string) => Boolean(value && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100);

/** comdirect TAN challenge: photoTAN image, mobileTAN hint or photoTAN-push approval. */
export const TanDialog = () => {
    const { tanRequest, submitTan, cancelTan } = useBrokerSync();
    const [tan, setTan] = useState('');
    if (!tanRequest) return null;

    const { type, challenge } = tanRequest.challenge;
    const isPush = type === 'P_TAN_PUSH';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
            <form
                className="w-full max-w-sm rounded-3xl border p-6 shadow-2xl"
                style={{ background: 'var(--md3-surface)', borderColor: 'var(--md3-outline)' }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tan-title"
                onSubmit={(e) => {
                    e.preventDefault();
                    const value = tan;
                    setTan('');
                    void submitTan(isPush ? undefined : value);
                }}
            >
                <div className="flex items-start gap-3">
                    <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                        style={{ background: 'var(--md3-primary-container)', color: 'var(--md3-on-primary-container)' }}
                    >
                        {isPush ? <Smartphone size={20} /> : <KeyRound size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div id="tan-title" className="text-sm font-semibold md3-text-main">comdirect: TAN für den Abruf</div>
                        <div className="mt-0.5 text-xs md3-text-muted">{tanRequest.connection.label}</div>
                    </div>
                    <button type="button" onClick={() => { setTan(''); cancelTan(); }} className="md3-icon-btn" aria-label="Abbrechen">
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4 text-sm md3-text-main">
                    {isPush && 'Bitte die Anmeldung in der comdirect photoTAN-App freigeben und danach bestätigen.'}
                    {type === 'M_TAN' && `Die mobileTAN wurde an ${challenge || 'deine Mobilnummer'} gesendet.`}
                    {type === 'P_TAN' && 'Die Grafik mit der photoTAN-App scannen und die angezeigte TAN eingeben.'}
                </div>
                {type === 'P_TAN' && isPngBase64(challenge) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`data:image/png;base64,${challenge}`} alt="photoTAN-Grafik" className="mx-auto mt-3 h-48 w-48 rounded-xl bg-white p-2" />
                )}
                {!isPush && (
                    <label className="mt-4 block text-xs font-semibold md3-text-muted">
                        TAN
                        <input
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={tan}
                            onChange={(e) => setTan(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="md3-field mt-1 w-full px-3 py-2 text-center text-lg tracking-[0.4em] outline-none"
                        />
                    </label>
                )}
                <p className="mt-3 text-xs md3-text-muted">Jede TAN wird genau einmal gesendet. Nach drei falschen TANs sperrt comdirect den Zugang.</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => { setTan(''); cancelTan(); }} className="md3-text-muted px-3 py-2 text-sm font-semibold">
                        Abbrechen
                    </button>
                    <button type="submit" disabled={!isPush && tan.length !== 6} className="md3-filled-btn px-4 py-2 text-sm font-semibold disabled:opacity-50">
                        {isPush ? 'Freigegeben' : 'Bestätigen'}
                    </button>
                </div>
            </form>
        </div>
    );
};
