const pkg = require('yahoo-finance2');
const YahooFinance = pkg.default || pkg;

// If it's a function (class), instantiate it.
let yahooFinance;
try {
    yahooFinance = new YahooFinance();
} catch (e) {
    yahooFinance = YahooFinance; // Fallback if it's already an instance
}

async function run() {
    try {
        const symbol = 'AAPL';
        // yahooFinance.suppressNotices(['yahooSurvey']); 

        const quote = await yahooFinance.quote(symbol);
        const summary = await yahooFinance.quoteSummary(symbol, { modules: ['summaryDetail'] });

        console.log('Quote dividendYield:', quote.dividendYield);
        console.log('SummaryDetail dividendYield:', summary.summaryDetail.dividendYield);
    } catch (e) {
        console.error(e);
    }
}

run();
