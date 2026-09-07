"""Exemplo modular de back-end FastAPI para a Assistente Meu Caixa.

O aplicativo publicado usa a rota TypeScript em ``app/api/assistant/route.ts``.
Este módulo mostra a implementação Python equivalente para uma futura API
separada, mantendo autenticação, isolamento por usuário e consultas SQL
parametrizadas.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import UTC, datetime
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from system_prompt import SYSTEM_PROMPT

app = FastAPI(title="Meu Caixa - Assistente IA", version="1.0.0")


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1_000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=8)


class ChatResponse(BaseModel):
    answer: str
    context_updated_at: str


def get_connection() -> sqlite3.Connection:
    """Abre a conexão e permite acessar colunas pelo nome."""
    connection = sqlite3.connect(os.getenv("DATABASE_PATH", "meu-caixa.db"))
    connection.row_factory = sqlite3.Row
    return connection


def authenticated_user_id(
    user_id: str | None = Header(default=None, alias="oai-authenticated-user-id"),
) -> str:
    """Lê a identidade já validada pelo gateway de autenticação.

    Em produção, o proxy deve remover qualquer cabeçalho enviado pelo navegador
    e preencher este valor somente depois de validar a sessão. Nunca confie em
    um X-User-Id arbitrário enviado pelo cliente.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Usuário não autenticado.")
    return user_id


def current_month_range() -> tuple[str, str, str]:
    now = datetime.now(UTC)
    month = now.strftime("%Y-%m")
    start = f"{month}-01"
    next_month = (
        f"{now.year + 1}-01-01"
        if now.month == 12
        else f"{now.year}-{now.month + 1:02d}-01"
    )
    return month, start, next_month


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, object]]:
    return [dict(row) for row in rows]


def load_financial_context(owner_id: str) -> dict[str, object]:
    """Busca apenas os dados pertencentes ao usuário autenticado.

    Os ``?`` são parâmetros SQL: além de impedir injeção, cada consulta pessoal
    exige explicitamente ``owner_id``.
    """
    month, start, next_month = current_month_range()

    with get_connection() as connection:
        monthly = connection.execute(
            """
            SELECT
              COALESCE(SUM(CASE WHEN type = 'income'
                THEN amount_cents ELSE 0 END), 0) AS income_cents,
              COALESCE(SUM(CASE WHEN type = 'expense'
                THEN amount_cents ELSE 0 END), 0) AS expense_cents
            FROM transactions
            WHERE owner_id = ?
              AND transaction_date >= ? AND transaction_date < ?
            """,
            (owner_id, start, next_month),
        ).fetchone()

        account = connection.execute(
            """
            SELECT COALESCE(SUM(CASE WHEN type = 'income'
              THEN amount_cents ELSE -amount_cents END), 0) AS balance_cents
            FROM transactions WHERE owner_id = ?
            """,
            (owner_id,),
        ).fetchone()

        categories = connection.execute(
            """
            SELECT c.name AS category, SUM(t.amount_cents) AS total_cents
            FROM transactions t
            JOIN categories c ON c.id = t.category_id
            WHERE t.owner_id = ? AND t.type = 'expense'
              AND t.transaction_date >= ? AND t.transaction_date < ?
            GROUP BY c.id, c.name
            ORDER BY total_cents DESC
            LIMIT 5
            """,
            (owner_id, start, next_month),
        ).fetchall()

        cards = connection.execute(
            """
            SELECT c.name, c.credit_limit_cents AS limit_total_cents,
              c.closing_day, c.due_day,
              COALESCE(SUM(CASE WHEN i.status != 'paid'
                THEN t.amount_cents ELSE 0 END), 0) AS outstanding_cents,
              COALESCE(SUM(CASE WHEN i.status != 'paid'
                AND i.reference_month = ? THEN t.amount_cents ELSE 0 END), 0)
                AS current_invoice_cents,
              COALESCE(SUM(CASE WHEN i.status != 'paid'
                AND i.reference_month > ? THEN t.amount_cents ELSE 0 END), 0)
                AS future_installments_cents
            FROM credit_cards c
            LEFT JOIN credit_card_invoices i
              ON i.card_id = c.id AND i.owner_id = c.owner_id
            LEFT JOIN credit_card_transactions t
              ON t.invoice_id = i.id AND t.owner_id = c.owner_id
            WHERE c.owner_id = ?
            GROUP BY c.id, c.name, c.credit_limit_cents,
              c.closing_day, c.due_day
            ORDER BY c.name
            """,
            (month, month, owner_id),
        ).fetchall()

        wallet = connection.execute(
            """
            SELECT balance_cents,
              annual_cdi_rate_bps / 100.0 AS annual_cdi_rate_percent,
              cdb_percentage_bps / 100.0 AS cdb_percentage_of_cdi
            FROM investment_wallets WHERE owner_id = ?
            """,
            (owner_id,),
        ).fetchone()

    income_cents = int(monthly["income_cents"] if monthly else 0)
    expense_cents = int(monthly["expense_cents"] if monthly else 0)
    card_data = rows_to_dicts(cards)
    for card in card_data:
        card["available_cents"] = int(card["limit_total_cents"]) - int(
            card["outstanding_cents"]
        )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "reference_month": month,
        "monthly_summary": {
            "income_cents": income_cents,
            "expense_cents": expense_cents,
            "balance_cents": income_cents - expense_cents,
        },
        "main_account_balance_cents": int(account["balance_cents"] if account else 0),
        "top_expense_categories": rows_to_dicts(categories),
        "credit_cards": card_data,
        "investment_wallet": dict(wallet) if wallet else None,
    }


@app.post("/api/assistant", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    owner_id: str = Depends(authenticated_user_id),
) -> ChatResponse:
    """Injeta o contexto SQL no prompt e solicita uma resposta ao modelo."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Configure OPENAI_API_KEY no ambiente do servidor.",
        )

    context = load_financial_context(owner_id)
    instructions = (
        f"{SYSTEM_PROMPT}\n\n<contexto_financeiro>\n"
        f"{json.dumps(context, ensure_ascii=False)}\n</contexto_financeiro>"
    )
    safe_user_identifier = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()

    client = OpenAI(api_key=api_key)
    response = client.responses.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
        instructions=instructions,
        input=[
            *[message.model_dump() for message in request.history],
            {"role": "user", "content": request.message.strip()},
        ],
        max_output_tokens=700,
        store=False,
        safety_identifier=safe_user_identifier,
    )

    answer = response.output_text.strip()
    if not answer:
        raise HTTPException(status_code=502, detail="A IA retornou resposta vazia.")

    return ChatResponse(
        answer=answer,
        context_updated_at=str(context["generated_at"]),
    )
