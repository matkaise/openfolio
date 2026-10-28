# Test fixtures

Synthetic broker exports. Every security, ISIN, order ID and amount here is made up.
Never copy rows from a real export into this folder.

- `degiro-account.csv`: DEGIRO "Account.csv" (Kontoübersicht), newest row first, CHF base account with
  USD and EUR sub-accounts. Saldo columns are consistent; final balances are CHF 2812.92, EUR 8.82, USD -0.10.
  The AutoFX fee has no row of its own: it is priced into the CHF leg of each currency exchange.
  Covers deposits, withdrawals (amount only in the description), FX legs, fees, dividends with withholding tax,
  negative interest ("Zinsen"), interest income, cash sweep transfers and a wrapped order ID continuation line.
- `degiro-transactions.csv`: DEGIRO "Transactions.csv" with the four trades booked in the account fixture.
  `Gesamt CHF` = `Wert CHF` + transaction fees; the AutoFX fee is reported separately, as in real exports.
- `swissquote-en.csv`: Swissquote transaction export, English, 13 columns, newest row first. One account with
  CHF and USD; balances are consistent and end at CHF 1576.33 and USD 45.00. Covers a deposit (Payment),
  a withdrawal with transfer costs (Debit), FX pairs (Forex credit/debit), a buy order filled in two rows,
  a sell, a dividend, custody fees, negative interest, an empty tax statement row (ignored) and a stock
  split (not supported, must be reported).
- `swissquote-de.csv`: Swissquote export in German, 15 columns, CHF account buying a USD security: net amount
  in USD and in the account currency. Ends at CHF 807.84 and USD 0.
