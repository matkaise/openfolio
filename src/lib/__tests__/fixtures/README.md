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
- `trading212.csv`: Trading 212 history export with the optional columns for withholding tax, stamp duty and
  currency conversion. Covers a deposit, a market buy with conversion fee, a GBX limit buy with stamp duty in
  GBP, a dividend with withholding tax, interest, a sell, a currency conversion, a withdrawal, plus a stock
  split and a card payment (both not supported, must be reported).
- `saxo.csv`: Saxo transactions export as Excel saves it as CSV (comma separated, amounts with decimal comma in
  quotes), 15-column variant with "Booked Amount", newest row first. EUR account: a deposit, EUR buys and a sell
  whose booked amount includes costs, a USD and a GBX buy converted into EUR (conversion rate ≠ 1), dividends
  (one converted), a withholding tax row, custody fee, interest, a withdrawal, two identical buys without order
  id, a Dutch buy ("Koop", month "mei") and a stock split (not supported, must be reported). Cash ends at
  EUR 2404.73, USD 0 and GBX 0.
- `schwab.csv`: Charles Schwab account history export (all cells quoted, US number format with `$`, thousands
  commas and a parenthesized negative), newest row first, closing "Transactions Total" row. Covers a MoneyLink
  deposit, buys with and without commission (one with "as of" date, one with a thousands quantity), reinvested
  dividend plus Reinvest Shares, a cash dividend with Foreign Tax Paid and ADR fee, two identical advisor fees,
  credit and margin interest, a sell with commission, a wire withdrawal, plus a stock split and journaled shares
  (both not supported, must be reported). The bookings sum to the total row: USD 1682.85.
- `revolut.csv`: Revolut investment account statement as CSV (comma), oldest row first. USD and EUR: deposits
  (one with a thousands comma), market and limit buys, custody fee, dividend, a sell whose total includes a
  $0.02 cost, a withdrawal, a EUR buy with a decimal-comma quantity, plus a stock split and a position transfer
  between Revolut entities (both not supported, must be reported) and an empty cash transfer (ignored). Cash ends
  at USD 569.58 and EUR 60.
