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
- `traderepublic.csv`: Trade Republic transaction export (Transaktionsexport), comma separated and quoted, one EUR
  account. Generated row by row; `amount + fee + tax` of all booked rows ends at EUR 2143.79 (the crypto buy is not
  booked). Holdings at the end: 6 DE0000000001, 1.234567 IE0000000002, 20 US0000000003, 0 of the matured bond.
  Covers a card top-up with fee, a transfer in, partial fills, a savings plan buy, a crypto buy (not supported),
  Vorabpauschale with tax and one without (ignored), interest with tax, a USD dividend with tax, its reversal and
  re-booking, a card payment, Saveback, a sale with fee and tax, a bond coupon, redemption (ignored) and final
  maturity, a withdrawal, a split (not supported) and a tax optimisation refund. Names, IBANs and ids are made up.
- `trading212.csv`: Trading 212 history export with the optional columns for withholding tax, stamp duty and
  currency conversion. Covers a deposit, a market buy with conversion fee, a GBX limit buy with stamp duty in
  GBP, a dividend with withholding tax, interest, a sell, a currency conversion, a withdrawal, plus a stock
  split and a card payment (both not supported, must be reported).
