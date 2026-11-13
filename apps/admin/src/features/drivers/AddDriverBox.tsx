import { useState } from 'react';
import { C } from '@voltara/ui';
import { useAddDriver } from './hooks';

/**
 * Add a driver by the email or phone number of their app account. The match
 * is exact; an address with no account says so, since the driver has to sign
 * up in the app first.
 */
export function AddDriverBox(target: { billingAccountId?: string; driverGroupId?: string }) {
  const add = useAddDriver(target);
  const [contact, setContact] = useState('');
  const ready = contact.trim().length >= 5 && !add.isPending;
  const submit = () => ready && add.mutate(contact.trim(), { onSuccess: () => setContact('') });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={contact}
          onChange={(e) => {
            setContact(e.target.value);
            if (add.error) add.reset();
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Driver's email or phone number"
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            fontFamily: 'Figtree',
            fontSize: 13,
            outline: 'none',
            background: C.white,
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        />
        <button
          onClick={submit}
          disabled={!ready}
          style={{
            padding: '9px 16px',
            borderRadius: 10,
            border: 'none',
            background: ready ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: ready ? 'pointer' : add.isPending ? 'wait' : 'not-allowed',
            opacity: ready ? 1 : 0.6,
            whiteSpace: 'nowrap',
          }}
        >
          {add.isPending ? 'Adding…' : 'Add driver'}
        </button>
      </div>
      {add.error && (
        <div style={{ fontSize: 12, color: C.error, marginTop: 6 }}>
          {(add.error as Error).message}
        </div>
      )}
    </div>
  );
}
