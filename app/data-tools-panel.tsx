'use client';
import { apiFetch, readApiJson } from '@/lib/client-api';

import { useState } from 'react';
import {
  AlertCircle,
  Download,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Preview = {
  totalMissing: number;
  counts: Record<string, { total: number; missing: number }>;
  action: string;
};

const labels: Record<string, string> = {
  recurring_rules: 'Recorrências',
  transactions: 'Transações',
  budgets: 'Orçamentos',
  investment_wallets: 'Carteira de investimentos',
  investment_contributions: 'Aportes',
  investments: 'Ativos',
  saved_simulations: 'Simulações',
  credit_cards: 'Cartões',
  credit_card_invoices: 'Faturas',
  credit_card_transactions: 'Compras no cartão',
};

export function DataToolsPanel({
  onRestored,
}: {
  onRestored: () => Promise<void>;
}) {
  const [rawBackup, setRawBackup] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function download(format: 'csv' | 'backup') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`/api/data-export?format=${format}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = (await readApiJson(response)) as { error?: string };
        throw new Error(result.error ?? 'Não foi possível exportar os dados.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        format === 'csv' ? 'meu-caixa-transacoes.csv' : 'meu-caixa-backup.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(
        format === 'csv'
          ? 'CSV gerado.'
          : 'Backup JSON gerado. Guarde-o em local privado.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na exportação.');
    } finally {
      setBusy(false);
    }
  }

  async function inspect(file: File | undefined) {
    setPreview(null);
    setRawBackup('');
    setFileName('');
    setMessage('');
    setError('');
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('O arquivo precisa ter até 2 MB.');
      return;
    }
    setBusy(true);
    try {
      const raw = await file.text();
      const response = await apiFetch('/api/data-restore?mode=preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      });
      const result = (await readApiJson(response)) as Preview & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Backup inválido.');
      setRawBackup(raw);
      setFileName(file.name);
      setPreview(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível verificar o backup.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!preview || !rawBackup) return;
    if (
      !window.confirm(
        `Restaurar ${preview.totalMissing} registros ausentes de “${fileName}” nesta conta? Dados atuais não serão apagados nem sobrescritos.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/api/data-restore?mode=restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBackup,
      });
      const result = (await readApiJson(response)) as {
        error?: string;
        totalMissing?: number;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Não foi possível restaurar os dados.');
      setMessage(
        `${result.totalMissing ?? 0} registros ausentes restaurados. Os dados atuais foram preservados.`,
      );
      setPreview(null);
      setRawBackup('');
      setFileName('');
      await onRestored();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Falha na restauração.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mx-auto max-w-7xl px-5 pb-8 sm:px-8 lg:px-10"
      aria-label="Exportação e recuperação de dados"
    >
      <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-foreground/15">
        <CardHeader className="border-b border-foreground/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="size-5 text-primary" /> Seus dados e backup
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Exporte as transações em CSV ou baixe um backup JSON de todas as
            áreas financeiras. A restauração verifica o arquivo antes de
            adicionar apenas registros ausentes na mesma conta.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void download('csv')}
            >
              <Download /> Baixar transações CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void download('backup')}
            >
              <Download /> Baixar backup completo JSON
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="restore-file">
              Verificar backup para restauração
            </Label>
            <Input
              id="restore-file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void inspect(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Até 2 MB e 2.000 registros. O arquivo deve ser da mesma conta. A
              prévia não grava nada.
            </p>
          </div>
          {preview && (
            <div className="space-y-3 rounded-xl border border-foreground/15 bg-inverse/5 p-4">
              <p className="font-semibold">
                Prévia: {preview.totalMissing} registros ausentes
              </p>
              <p className="text-sm text-muted-foreground">{preview.action}</p>
              <div className="grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(preview.counts).map(([table, count]) => (
                  <p key={table}>
                    {labels[table] ?? table}: {count.missing} de {count.total}{' '}
                    para adicionar
                  </p>
                ))}
              </div>
              <Button
                type="button"
                disabled={busy || preview.totalMissing === 0}
                onClick={() => void restore()}
              >
                <Upload /> Restaurar registros ausentes
              </Button>
            </div>
          )}
          {(error || message) && (
            <output
              aria-live="polite"
              className={`flex items-center gap-2 text-sm ${error ? 'text-destructive' : 'text-foreground'}`}
            >
              {error ? (
                <AlertCircle className="size-4" />
              ) : busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {error || message}
            </output>
          )}
          <p className="text-xs text-muted-foreground">
            Este arquivo é uma cópia sob seu controle, não substitui o backup de
            infraestrutura ou o histórico de recuperação do banco Neon. Mantenha
            o JSON privado; ele contém dados financeiros pessoais.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
