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
- `xtb-cash-operations.csv`: XTB "Cash Operations" sheet saved as CSV (`;`, decimal comma), 8-column layout with the
  four metadata rows and the closing Total row (1009.11 = sum of all amounts). Account currency EUR comes from the
  file name the tests pass (`EUR_account_….csv`). Booked rows add up to EUR 971.61; holdings 6 ACME.DE, 5 EXMP.US,
  0.5 WRLD.DE. Covers a deposit, partial fills, financial transaction tax, interest with its tax, a sale with
  commission, a dividend with withholding tax, a withdrawal, a paired sub-account transfer (ignored), and CFD rows
  (Close trade, Swap, index dividend), a spin-off and a transfer to another account (all not supported).
- `xtb-legacy.csv`: the former direct XTB CSV export (`ID;Type;Time;Symbol;Comment;Amount`, decimal point) with two
  identical buys of different operation ids, interest with tax, a dividend with withholding tax and a CFD result.
  Booked rows add up to EUR 603.55.
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
- `etoro.csv`: eToro account statement, sheet "Account Activity" saved as CSV (comma, US number format with quoted
  thousands and parenthesized negatives), oldest row first, "Units / Contracts" header. Balance and Realized Equity are
  consistent row by row. Covers a converted EUR deposit with its informational conversion fee, stock and ETF buys
  (one UK stock in GBX with SDRT), two dividends of the same stock, a partial close, interest, a withdrawal with its
  fee and conversion fee, plus a CFD position with overnight fee and close and a crypto buy (all not supported).
  Booked cash ends at USD 310.35; eToro's balance 268.11 = 310.35 + CFD result 7.76 − crypto 50.
- `freetrade.csv`: Freetrade activity feed export (comma, 29 columns, ISO timestamps), newest row first, one GBP
  account. Covers a top-up, a GBP ETF buy, a UK buy with stamp duty, a free share, a USD buy with FX fee, interest,
  a monthly statement (ignored), a USD dividend with withholding tax, a GBP dividend without tax, a sell and a
  property income distribution with tax, and a withdrawal. Cash ends at GBP 22.41; holdings 10 IE0000000011,
  60 GB0000000021, 1 US0000000031, 2 US0000000041.
- `investengine.csv`: InvestEngine "Trading statement" (comma, amounts with "£", one with a thousands comma, dates
  DD/MM/YY), two ETFs, a name containing a comma (quoted), two identical buys on the same day and a sell. Trades only:
  cash effect GBP −1255.50, holdings 11.7 IE0000000101 and 10 IE0000000202.
- `avanza.csv`: Avanza transaction export (`;`, decimal comma, ISO dates), newest row first, two accounts ("ISK" and
  "9876543") with a transfer between them. Covers a deposit, SEK buys with and without courtage, a USD stock bought in
  SEK with courtage, a dividend with foreign withholding tax, interest, yield tax (Avkastningsskatt), a fund fee refund,
  a sale with result and a fund switch as two "Övrigt" rows (not supported). Cash ends at SEK 3397.81 (ISK 3360.81,
  9876543 37.00).
- `directa.csv`: Directa "Movimenti" CSV with BOM and the nine metadata rows (some of only commas), newest row first,
  EUR. Covers a deposit, an ETF buy, a bond buy with accrued interest (Ratei), an Italian stock buy with Tobin tax, an
  ETF distribution and a bond coupon with withheld tax, stamp duty (Bollo), a sale with capital gains tax, a withdrawal
  and the empty trailing row. Cash ends at EUR 1064.10.
- `disnat.csv`: Disnat account history saved from XLSX as CSV (French, comma, quoted decimal commas, "-" as empty),
  newest row first, CAD account. Covers a contribution, buys with and without commission (one "-C" symbol), a USD
  stock bought on the CAD account, dividends with the bare symbol, withholding tax, interest, an annual fee with
  GST/QST, a sale with commission, a cash transfer in, a security transfer (not supported) and a withdrawal. Cash ends
  at CAD 1362.77.
- `finpension-3a.csv`: Finpension pillar 3a transaction report (`;`, BOM, quoted headers), newest row first, Balance
  consistent row by row. Covers a deposit, fund buys, the flat-rate fee, a distribution, interest, a rebalancing sell and
  buy and a made-up unknown category "Tax refund" (reported). Booked cash CHF 341.95; Balance 345.15 includes the
  reported row.
- `finpension-bvg.csv`: Finpension vested benefits (BVG) report: transfer of vested benefits, two buys and one sell as
  "Portfolio Transaction", fee, interest and a distribution. Cash ends at CHF 70.35.
- `ibkr-flex.xml`: Activity Flex Query (XML) of one account. Covers stock trades, a currency conversion with
  commission, an option trade (not supported), cash transactions in detail and as summary, a sales tax, open positions,
  a corporate action and a transfer (both not supported, must be reported). Ends at USD 2414.99 and EUR -3.00 without the option.
