"""API opcional para executar as projeções em um servidor Python/FastAPI."""

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="Meu Caixa - Simulações", version="1.0.0")


class DebtRequest(BaseModel):
    principal: float = Field(gt=0)
    monthly_rate_percent: float = Field(ge=0, le=100)
    months: int = Field(ge=1, le=120)


class InvestmentRequest(BaseModel):
    initial_value: float = Field(ge=0)
    monthly_contribution: float = Field(ge=0)
    monthly_rate_percent: float = Field(ge=0, le=100)
    duration_value: int = Field(ge=1, le=600)
    duration_unit: Literal["months", "years"] = "months"
    future_expense: float = Field(ge=0, default=0)

    @model_validator(mode="after")
    def validate_projection(self) -> "InvestmentRequest":
        months = (
            self.duration_value * 12
            if self.duration_unit == "years"
            else self.duration_value
        )
        if months > 600:
            raise ValueError("O período máximo é de 600 meses.")
        if self.initial_value == 0 and self.monthly_contribution == 0:
            raise ValueError("Informe um valor inicial ou aporte mensal.")
        return self


def simulate_debt(payload: DebtRequest) -> dict:
    """Gera o montante da dívida e um ponto para cada mês."""
    monthly_rate = payload.monthly_rate_percent / 100
    points = []

    for month in range(payload.months + 1):
        amount = payload.principal * (1 + monthly_rate) ** month
        points.append({"month": month, "value": round(amount, 2)})

    final_amount = points[-1]["value"]
    return {
        "points": points,
        "final_amount": final_amount,
        "total_interest": round(final_amount - payload.principal, 2),
    }


def simulate_investment(payload: InvestmentRequest) -> dict:
    """Projeta aportes postecipados e retorna a série mensal do patrimônio."""
    months = (
        payload.duration_value * 12
        if payload.duration_unit == "years"
        else payload.duration_value
    )
    monthly_rate = payload.monthly_rate_percent / 100
    balance = payload.initial_value
    points = [{"month": 0, "value": round(balance, 2)}]

    for month in range(1, months + 1):
        balance = balance * (1 + monthly_rate) + payload.monthly_contribution
        points.append({"month": month, "value": round(balance, 2)})

    total_contributed = payload.initial_value + payload.monthly_contribution * months
    return {
        "points": points,
        "final_amount": round(balance, 2),
        "total_contributed": round(total_contributed, 2),
        "total_earnings": round(balance - total_contributed, 2),
        "comparison": round(balance - payload.future_expense, 2),
    }


@app.post("/simulations/debt")
def debt_route(payload: DebtRequest) -> dict:
    return simulate_debt(payload)


@app.post("/simulations/investment")
def investment_route(payload: InvestmentRequest) -> dict:
    return simulate_investment(payload)
