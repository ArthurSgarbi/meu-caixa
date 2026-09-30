'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { useState, type ReactNode } from 'react';
import {
  EyeOff,
  Bell,
  LoaderCircle,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  defaultPreferences,
  type UserPreferences,
} from '@/lib/user-preferences';
import { usePreferences } from './preferences-provider';
import { DataToolsPanel } from './data-tools-panel';

export function SettingsPanel({
  onRestored,
}: {
  onRestored: () => Promise<void>;
}) {
  const { preferences, loading, saving, error, reload, update } =
    usePreferences();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const [resetOpen, setResetOpen] = useState(false);
  const [message, setMessage] = useState('');
  const disabled = loading || saving || Boolean(error);

  async function change(patch: Partial<UserPreferences>) {
    setMessage('');
    if (await update(patch)) setMessage('Configurações salvas na sua conta.');
  }

  return (
    <section
      className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10"
      aria-labelledby="settings-title"
    >
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            id="settings-title"
            className="flex items-center gap-3 text-2xl font-bold tracking-tight"
          >
            <Settings aria-hidden="true" /> Configurações
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Seu Meu Caixa, do seu jeito. As preferências ficam vinculadas à sua
            conta e não alteram seus lançamentos.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setResetOpen(true)}
          disabled={disabled}
        >
          <RotateCcw /> Restaurar preferências
        </Button>
      </div>
      <output
        aria-live="polite"
        className="mb-5 block min-h-6 text-sm text-muted-foreground"
      >
        {loading || saving ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {loading ? 'Carregando suas preferências…' : 'Salvando…'}
          </span>
        ) : !error ? (
          message || 'Alterações são salvas automaticamente.'
        ) : null}
      </output>
      {error && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <span>{error}</span>
          <Button variant="outline" onClick={reload} disabled={saving}>
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SettingsGroup title="Aparência e leitura" icon={<Palette />}>
          <fieldset
            disabled={disabled}
            className="space-y-5 disabled:opacity-60"
          >
            <legend className="sr-only">Preferências de aparência</legend>
            <div>
              <p id="theme-label" className="mb-3 text-sm font-semibold">
                Tema do site
              </p>
              <fieldset
                aria-labelledby="theme-label"
                className="grid grid-cols-3 gap-2"
              >
                {(
                  [
                    { value: 'dark', label: 'Escuro', icon: Moon },
                    { value: 'light', label: 'Claro', icon: Sun },
                    { value: 'system', label: 'Sistema', icon: Monitor },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={
                      preferences.theme === value ? 'default' : 'outline'
                    }
                    aria-pressed={preferences.theme === value}
                    onClick={() => void change({ theme: value })}
                    className="h-auto min-h-20 flex-col gap-2"
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </Button>
                ))}
              </fieldset>
              <p className="mt-2 text-xs text-muted-foreground">
                O modo claro troca fundos azul-escuro por tons pérola e textos
                claros por azul profundo, preservando o champagne.
              </p>
            </div>
            <ToggleSetting
              id="large-text"
              title="Texto ampliado"
              description="Aumenta a base de leitura da interface."
              checked={preferences.largeText}
              onChange={(value) => void change({ largeText: value })}
            />
            <ToggleSetting
              id="reduce-motion"
              title="Reduzir animações"
              description="Reduz transições e animações dos gráficos. A preferência de acessibilidade do sistema também é respeitada."
              checked={preferences.reduceMotion}
              onChange={(value) => void change({ reduceMotion: value })}
            />
          </fieldset>
        </SettingsGroup>
        <SettingsGroup title="Privacidade e painel" icon={<EyeOff />}>
          <fieldset
            disabled={disabled}
            className="space-y-5 disabled:opacity-60"
          >
            <legend className="sr-only">
              Preferências de privacidade e navegação
            </legend>
            <ToggleSetting
              id="hide-balances"
              title="Modo discreto"
              description="Oculta valores e gráficos financeiros nos painéis. Não esconde textos do chat, formulários de edição ou arquivos exportados."
              checked={preferences.hideBalances}
              onChange={(value) => void change({ hideBalances: value })}
            />
            <div className="space-y-2">
              <Label htmlFor="default-area">Área inicial ao abrir o site</Label>
              <NativeSelect
                id="default-area"
                className="w-full"
                value={preferences.defaultArea}
                onChange={(event) =>
                  void change({
                    defaultArea: event.target
                      .value as UserPreferences['defaultArea'],
                  })
                }
              >
                <NativeSelectOption value="overview">
                  Visão Geral
                </NativeSelectOption>
                <NativeSelectOption value="expenses">Gastos</NativeSelectOption>
                <NativeSelectOption value="investments">
                  Investimentos
                </NativeSelectOption>
                <NativeSelectOption value="credit-cards">
                  Cartões
                </NativeSelectOption>
                <NativeSelectOption value="simulations">
                  Simulações
                </NativeSelectOption>
                <NativeSelectOption value="assistant">
                  Assistente IA
                </NativeSelectOption>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Será usada na próxima abertura; não interrompe a tela atual.
              </p>
            </div>
            <ToggleSetting
              id="market-auto-refresh"
              title="Atualizar cotações automaticamente"
              description="Durante o mercado aberto, consulta a cada minuto enquanto a página está visível. Desativado, você atualiza pelo botão do gráfico. A disponibilidade depende do provedor."
              checked={preferences.marketAutoRefresh}
              onChange={(value) => void change({ marketAutoRefresh: value })}
            />
          </fieldset>
        </SettingsGroup>
        <SettingsGroup title="Alertas financeiros" icon={<Bell />}>
          <fieldset
            disabled={disabled}
            className="space-y-5 disabled:opacity-60"
          >
            <legend className="sr-only">Tipos de alertas habilitados</legend>
            <ToggleSetting
              id="alert-budgets"
              title="Orçamentos"
              description="Avisa a partir de 80% do limite e quando ele é atingido ou ultrapassado. Considera despesas registradas até hoje."
              checked={preferences.alertBudgets}
              onChange={(value) => void change({ alertBudgets: value })}
            />
            <ToggleSetting
              id="alert-invoices"
              title="Vencimento de faturas"
              description="Avisa até 7 dias antes do vencimento e mantém faturas vencidas não marcadas como pagas."
              checked={preferences.alertInvoices}
              onChange={(value) => void change({ alertInvoices: value })}
            />
            <ToggleSetting
              id="alert-recurring"
              title="Recorrências pendentes"
              description="Lembra de confirmar receitas ou despesas recorrentes do mês cuja data já chegou."
              checked={preferences.alertRecurring}
              onChange={(value) => void change({ alertRecurring: value })}
            />
            <p className="text-xs text-muted-foreground">
              Os avisos aparecem no sino do site. Nenhum e-mail ou notificação
              externa é enviado.
            </p>
          </fieldset>
        </SettingsGroup>
        <SettingsGroup title="Minha conta" icon={<UserRound />}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="break-words font-medium">
                {user?.fullName || user?.username || 'Minha conta'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">E-mail principal</dt>
              <dd className="break-all font-medium">
                {user?.primaryEmailAddress?.emailAddress || 'Não informado'}
              </dd>
            </div>
          </dl>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => openUserProfile()}
          >
            <ShieldCheck /> Gerenciar perfil e segurança
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Gerencie os métodos de acesso, contas conectadas e sessões nas
            opções disponibilizadas pelo seu provedor de autenticação. Nunca
            informe senhas ou chaves no chat.
          </p>
        </SettingsGroup>
        <SettingsGroup title="Preferências financeiras" icon={<ShieldCheck />}>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium">Moeda e formato</dt>
              <dd className="mt-1 text-muted-foreground">
                Real brasileiro (BRL), valores em R$ e datas no padrão
                brasileiro.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Fuso das operações</dt>
              <dd className="mt-1 text-muted-foreground">
                America/Sao_Paulo. O mês financeiro continua seguindo o horário
                do Brasil.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Seus dados</dt>
              <dd className="mt-1 text-muted-foreground">
                Use o backup abaixo para guardar uma cópia. Exporte apenas em
                dispositivos de confiança: arquivos exportados contêm os valores
                completos.
              </dd>
            </div>
          </dl>
        </SettingsGroup>
      </div>
      <div className="mt-6">
        <DataToolsPanel onRestored={onRestored} />
      </div>
      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!saving) setResetOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar preferências padrão?</DialogTitle>
            <DialogDescription>
              Volta ao tema escuro e às preferências originais. Nenhuma receita,
              despesa, investimento ou fatura será excluída.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setResetOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={disabled}
              onClick={async () => {
                setMessage('');
                if (await update({ ...defaultPreferences })) {
                  setMessage(
                    'Preferências restauradas. Seus dados financeiros foram preservados.',
                  );
                  setResetOpen(false);
                }
              }}
            >
              Restaurar preferências
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SettingsGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-primary [&>svg]:size-5" aria-hidden="true">
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}

function ToggleSetting({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer font-semibold">
          {title}
        </Label>
        <p
          id={`${id}-description`}
          className="mt-1 text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        id={id}
        aria-describedby={`${id}-description`}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      />
    </div>
  );
}
