# Test fixtures

Synthetic broker exports. Every security, ISIN, order ID and amount here is made up.
Never copy rows from a real export into this folder.

- `degiro-account.csv`: DEGIRO "Account.csv" (Kontoübersicht), newest row first, CHF base account with
  USD and EUR sub-accounts. Saldo columns are consistent; final balances are CHF 2819.15, EUR 8.82, USD -0.10.
  Covers deposits, withdrawals (amount only in the description), FX legs, fees, dividends with withholding tax,
  negative interest ("Zinsen"), interest income, cash sweep transfers and a wrapped order ID continuation line.
- `degiro-transactions.csv`: DEGIRO "Transactions.csv" with the four trades booked in the account fixture.
  `Gesamt CHF` = `Wert CHF` + transaction fees; the AutoFX fee is reported separately, as in real exports.
