-- Reclassifica apenas saídas comprovadamente vinculadas a aportes antigos.
-- A mudança não altera o saldo da conta: transferências continuam saídas.
UPDATE transactions AS t
   SET type = 'transfer'
  FROM categories AS c
 WHERE t.category_id = c.id
   AND c.slug = 'investimentos'
   AND t.type = 'expense'
   AND EXISTS (
     SELECT 1
       FROM investment_contributions AS ic
      WHERE ic.owner_id = t.owner_id
        AND ic.contribution_date = t.transaction_date
        AND ic.amount_cents = t.amount_cents
        AND t.description = 'Investimento: ' || ic.description
   );
