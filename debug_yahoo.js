async function getYahooClient() {
    const pkg = await import('yahoo-finance2');
    const YahooFinance = pkg.default || pkg;

    // If it's a function (class), instantiate it.
    try {
        return new YahooFinance();
    } catch {
        return YahooFinance; // Fallback if it's already an instance
    }
}

async function run() {
    try {
        const yahooFinance = await getYahooClient();
        const symbol = 'AAPL';
        // yahooFinance.suppressNotices(['yahooSurvey']); 

        const quote = await yahooFinance.quote(symbol);
        const summary = await yahooFinance.quoteSummary(symbol, { modules: ['summaryDetail'] });

        console.log('Quote dividendYield:', quote.dividendYield);
        console.log('SummaryDetail dividendYield:', summary.summaryDetail.dividendYield);
    } catch (err) {
        console.error(err);
    }
}

run();
