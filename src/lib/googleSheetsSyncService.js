/**
 * Google Sheets Auto-Sync Service
 * Syncs Expenses and Daily Sales to Google Spreadsheet:
 * Spreadsheet ID: 1j8S_8MH_CnVD00CmH-zVOOb5mkgQePrxJio_CCz9M9s
 */

const APPSCRIPT_EXPENSES_ENDPOINT = "https://script.google.com/macros/s/AKfycbyjb9x3e6TRjmg_AW1ICsncDsGqQLENhNCAsF04ZB3OznE7iaC32ravMB1LHiACB1jp/exec";

/**
 * Auto-sync newly created expense to Google Sheet
 */
export const syncExpenseToGoogleSheet = async (expenseData) => {
    try {
        const payload = {
            action: 'add_expense',
            sheet_id: '1j8S_8MH_CnVD00CmH-zVOOb5mkgQePrxJio_CCz9M9s',
            date: expenseData.date || new Date().toISOString().split('T')[0],
            purchase_date: expenseData.purchase_date || expenseData.date,
            description: expenseData.description || 'General Expense',
            amount: expenseData.amount || 0,
            category: expenseData.category || 'General',
            expense_type: expenseData.expense_type || 'OPEX',
            supplier: expenseData.supplier || 'N/A',
            payment_method: expenseData.payment_method || 'Cash',
            captured_by: expenseData.captured_by || 'Samuel / Staff',
            receipt_url: expenseData.receipt_url || '',
            vat_amount: expenseData.vat_amount || 0,
            taxable_amount: expenseData.taxable_amount || expenseData.amount || 0
        };

        fetch(APPSCRIPT_EXPENSES_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.warn('Background Google Sheet expense sync notice:', err));
    } catch (e) {
        console.error('Error initiating expense sheet sync:', e);
    }
};

/**
 * Auto-sync daily sales summary to Google Sheet
 */
export const syncDailySalesToGoogleSheet = async (dailySalesSummary) => {
    try {
        const payload = {
            action: 'add_daily_sales',
            sheet_id: '1j8S_8MH_CnVD00CmH-zVOOb5mkgQePrxJio_CCz9M9s',
            date: dailySalesSummary.date || new Date().toISOString().split('T')[0],
            total_orders: dailySalesSummary.total_orders || 0,
            gross_sales: dailySalesSummary.gross_sales || 0,
            mpesa_sales: dailySalesSummary.mpesa_sales || 0,
            cash_sales: dailySalesSummary.cash_sales || 0,
            card_sales: dailySalesSummary.card_sales || 0,
            total_expenses: dailySalesSummary.total_expenses || 0,
            net_sales: dailySalesSummary.net_sales || 0
        };

        fetch(APPSCRIPT_EXPENSES_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.warn('Background Google Sheet sales sync notice:', err));
    } catch (e) {
        console.error('Error initiating daily sales sheet sync:', e);
    }
};
