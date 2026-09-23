'use client';

import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChartNoAxesCombined,
  Compass,
  Lightbulb,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Olá! Eu sou a assistente do Meu Caixa. Posso analisar seus dados financeiros, mostrar onde encontrar cada recurso e ajudar a transformar uma meta em um plano mensal.',
};

const suggestions = [
  'Onde gastei mais este mês?',
  'Qual é meu limite disponível nos cartões?',
  'Crie um plano para juntar R$ 5.000 em 6 meses.',
  'Como faço um novo investimento?',
] as const;

function newMessageId() {
  return crypto.randomUUID();
}

export function AssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function sendMessage(rawMessage: string) {
    const content = rawMessage.trim();
    if (!content || sending) return;

    const userMessage: ChatMessage = {
      id: newMessageId(),
      role: 'user',
      content,
    };
    const history = messages
      .filter((message) => message.id !== 'welcome')
      .slice(-8)
      .map(({ role, content: previousContent }) => ({
        role,
        content: previousContent,
      }));

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setError('');
    setSending(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, history }),
      });
      const result = (await response.json()) as {
        answer?: string;
        error?: string;
      };
      if (!response.ok || !result.answer) {
        throw new Error(
          result.error ?? 'A assistente não conseguiu responder agora.',
        );
      }

      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: 'assistant',
          content: result.answer ?? '',
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'A assistente não conseguiu responder agora.',
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge className="mb-3 border border-white/20 bg-white/10 text-white">
            <Sparkles className="size-3.5" /> Inteligência financeira
          </Badge>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            Assistente Meu Caixa
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
            Pergunte sobre seus dados, encontre recursos do aplicativo ou monte
            um plano financeiro com cálculos claros.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#292d35]/75 px-3 py-2 text-xs text-white/75">
          <ShieldCheck className="size-4 text-white" />
          Dados isolados por usuário
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
        <Card className="overflow-hidden border-white/15 bg-[#292d35]/90 text-white shadow-2xl shadow-black/20">
          <CardHeader className="border-b border-white/10 bg-white/[0.035]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#ff6b35] to-[#d82828] text-white shadow-lg shadow-red-950/25">
                <Bot className="size-5" />
              </span>
              <div>
                <CardTitle className="text-base">Conversa financeira</CardTitle>
                <p className="mt-0.5 text-xs text-white/60">
                  Consulta os dados atualizados a cada pergunta
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div
              className="h-[510px] overflow-y-auto px-4 py-6 sm:px-6"
              aria-live="polite"
              aria-label="Mensagens da conversa"
            >
              <div className="space-y-5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' ? (
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white">
                        <Bot className="size-4" />
                      </span>
                    ) : null}
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[75%] ${
                        message.role === 'user'
                          ? 'rounded-br-md bg-gradient-to-br from-[#ff6533] to-[#df2f2f] text-white'
                          : 'rounded-bl-md border border-white/10 bg-white/[0.065] text-white/90'
                      }`}
                    >
                      {message.content}
                    </div>
                    {message.role === 'user' ? (
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#292d35]">
                        <UserRound className="size-4" />
                      </span>
                    ) : null}
                  </div>
                ))}

                {sending ? (
                  <div className="flex items-end gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10">
                      <Bot className="size-4" />
                    </span>
                    <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.065] px-4 py-3 text-sm text-white/65">
                      <span className="mr-2 inline-flex gap-1 align-middle">
                        <span className="size-1.5 animate-bounce rounded-full bg-[#ff6b35] [animation-delay:-.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#ff6b35] [animation-delay:-.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#ff6b35]" />
                      </span>
                      A IA está digitando...
                    </div>
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(draft);
              }}
              className="border-t border-white/10 bg-black/10 p-4 sm:p-5"
            >
              {error ? (
                <p
                  role="alert"
                  className="mb-3 rounded-lg border border-red-300/25 bg-red-950/30 px-3 py-2 text-xs text-red-100"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={2_000}
                  rows={2}
                  disabled={sending}
                  placeholder="Ex.: Onde gastei mais este mês?"
                  aria-label="Mensagem para a assistente"
                  className="max-h-36 min-h-14 resize-none border-white/15 bg-[#202329] px-4 py-3 text-white placeholder:text-white/40"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || !draft.trim()}
                  aria-label="Enviar mensagem"
                  className="size-12 shrink-0 bg-white text-[#292d35] hover:bg-white/85"
                >
                  {sending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-white/45">
                Enter envia · Shift + Enter quebra a linha · Planejamento
                educativo, não recomendação de investimento.
              </p>
              <p className="mt-1 text-[11px] text-white/45">
                Ao perguntar, os dados financeiros relevantes são processados
                pelo Cloudflare Workers AI para gerar a resposta.
              </p>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-5">
          <Card className="border-white/15 bg-[#292d35]/80 text-white">
            <CardHeader>
              <CardTitle className="text-base">O que posso fazer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Capability
                icon={<ChartNoAxesCombined />}
                title="Analisar seus dados"
                description="Resume receitas, gastos, categorias, cartões e investimentos."
              />
              <Capability
                icon={<Compass />}
                title="Guiar pelo aplicativo"
                description="Explica onde registrar e consultar cada informação."
              />
              <Capability
                icon={<Lightbulb />}
                title="Planejar uma meta"
                description="Transforma objetivo e prazo em um plano mensal calculado."
              />
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-[#292d35]/80 text-white">
            <CardHeader>
              <CardTitle className="text-base">Perguntas rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={sending}
                  onClick={() => void sendMessage(suggestion)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-left text-xs leading-5 text-white/75 transition hover:border-[#ff6b35]/60 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function Capability({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#ff8b60] [&_svg]:size-4">
        {icon}
      </span>
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-white/55">{description}</p>
      </div>
    </div>
  );
}
