"use client";

import React, { useState } from 'react';
import { KeyRound, Smartphone } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Field, TextInput } from '@/components/ui/primitives';
import { useBrokerSync } from './BrokerSyncContext';
import { useT } from '@/lib/i18n';

const isPngBase64 = (value?: string) => Boolean(value && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100);

/** comdirect TAN challenge: photoTAN image, mobileTAN hint or photoTAN-push approval. */
export const TanDialog = () => {
    const { tanRequest, submitTan, cancelTan } = useBrokerSync();
    const [tan, setTan] = useState('');
    const t = useT();
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
            title={t.brokers.tan.title}
            subtitle={`comdirect · ${tanRequest.connection.label}`}
            icon={isPush ? <Smartphone size={20} /> : <KeyRound size={20} />}
            footer={(
                <>
                    <Button variant="ghost" onClick={cancel}>{t.common.cancel}</Button>
                    <Button type="submit" form="tan-form" variant="primary" disabled={!isPush && tan.length !== 6}>{isPush ? t.brokers.tan.approved : t.brokers.tan.confirm}</Button>
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
                    {isPush && t.brokers.tan.push}
                    {type === 'M_TAN' && t.brokers.tan.mobile(challenge || null)}
                    {type === 'P_TAN' && t.brokers.tan.photo}
                </p>
                {type === 'P_TAN' && isPngBase64(challenge) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`data:image/png;base64,${challenge}`} alt={t.brokers.tan.photoAlt} className="ui-phototan" />
                )}
                {!isPush && (
                    <Field label="TAN" hint={t.brokers.tan.hint}>
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
