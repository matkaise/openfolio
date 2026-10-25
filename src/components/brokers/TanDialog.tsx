"use client";

import React, { useState } from 'react';
import { KeyRound, Smartphone } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Field, TextInput } from '@/components/ui/primitives';
import { useBrokerSync } from './BrokerSyncContext';

const isPngBase64 = (value?: string) => Boolean(value && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100);

/** comdirect TAN challenge: photoTAN image, mobileTAN hint or photoTAN-push approval. */
export const TanDialog = () => {
    const { tanRequest, submitTan, cancelTan } = useBrokerSync();
    const [tan, setTan] = useState('');
    if (!tanRequest) return null;

    const { type, challenge } = tanRequest.challenge;
    const isPush = type === 'P_TAN_PUSH';
    const cancel = () => { setTan(''); cancelTan(); };

    return (
        <Modal
            open
            size="sm"
            onClose={cancel}
            closeOnBackdrop={false}
            title="TAN für den Abruf"
            subtitle={`comdirect · ${tanRequest.connection.label}`}
            icon={isPush ? <Smartphone size={20} /> : <KeyRound size={20} />}
            footer={(
                <>
                    <Button variant="ghost" onClick={cancel}>Abbrechen</Button>
                    <Button type="submit" form="tan-form" variant="primary" disabled={!isPush && tan.length !== 6}>{isPush ? 'Freigegeben' : 'Bestätigen'}</Button>
                </>
            )}
        >
            <form
                id="tan-form"
                className="ui-stack"
                onSubmit={(e) => {
                    e.preventDefault();
                    const value = tan;
                    setTan('');
                    void submitTan(isPush ? undefined : value);
                }}
            >
                <p className="ui-modal-text">
                    {isPush && 'Bitte die Anmeldung in der comdirect photoTAN-App freigeben und danach bestätigen.'}
                    {type === 'M_TAN' && `Die mobileTAN wurde an ${challenge || 'deine Mobilnummer'} gesendet.`}
                    {type === 'P_TAN' && 'Die Grafik mit der photoTAN-App scannen und die angezeigte TAN eingeben.'}
                </p>
                {type === 'P_TAN' && isPngBase64(challenge) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`data:image/png;base64,${challenge}`} alt="photoTAN-Grafik" className="ui-phototan" />
                )}
                {!isPush && (
                    <Field label="TAN" hint="Jede TAN wird genau einmal gesendet. Nach drei falschen TANs sperrt comdirect den Zugang.">
                        <TextInput
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={tan}
                            onChange={(e) => setTan(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="ui-tan-input"
                        />
                    </Field>
                )}
            </form>
        </Modal>
    );
};
