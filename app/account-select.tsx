'use client';
import { useContext } from 'react';
import { AccountsContext } from '@/hooks/use-accounts-goals';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { useMoneyFormatter } from './preferences-provider';

export function formAccountId(value: FormDataEntryValue | null) {
  return value === 'main'
    ? null
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
}
export function AccountSelect({
  id,
  name,
  label = 'Conta',
  defaultValue = null,
  showBalance = false,
  allowAll = false,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label?: string;
  defaultValue?: number | null;
  showBalance?: boolean;
  allowAll?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const state = useContext(AccountsContext),
    money = useMoneyFormatter();
  const ready = Boolean(state?.data && !state.error);
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        key={ready ? 'loaded' : 'loading'}
        id={id}
        name={name}
        required={!allowAll}
        className="w-full"
        {...(value !== undefined
          ? { value, onChange: (event) => onChange?.(event.target.value) }
          : {
              defaultValue: allowAll
                ? ''
                : defaultValue === null
                  ? 'main'
                  : String(defaultValue),
            })}
      >
        {!ready ? (
          <NativeSelectOption value="">
            {state?.error ? 'Contas indisponíveis' : 'Carregando contas…'}
          </NativeSelectOption>
        ) : (
          <>
            {allowAll && (
              <NativeSelectOption value="">Todas as contas</NativeSelectOption>
            )}
            {state?.data?.accounts.map((account) => (
              <NativeSelectOption
                key={account.id ?? 'main'}
                value={account.id === null ? 'main' : String(account.id)}
              >
                {account.name}
                {showBalance
                  ? ` — livre: ${money(account.availableCents)}`
                  : ''}
              </NativeSelectOption>
            ))}
          </>
        )}
      </NativeSelect>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}{' '}
          <Button
            type="button"
            variant="link"
            onClick={() => void state.reload()}
          >
            Tentar novamente
          </Button>
        </p>
      )}
    </div>
  );
}
