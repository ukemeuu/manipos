const CACHE_KEY = 'poj_customer_feedback';
const CACHE_TIME_KEY = 'poj_customer_feedback_time';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const mapRow = (row) => {
    const cells = row.c || [];
    const getVal = (idx) => cells[idx]?.v !== undefined ? cells[idx].v : null;
    const getFormattedVal = (idx) => cells[idx]?.f !== undefined ? cells[idx].f : (cells[idx]?.v !== undefined ? String(cells[idx].v) : '');

    return {
        timestamp: getFormattedVal(0),
        code: getFormattedVal(1),
        serviceType: getFormattedVal(2),
        customerName: getFormattedVal(3),
        orderId: getFormattedVal(4),
        overallRating: getVal(5) !== null ? Number(getVal(5)) : null,
        foodRating: getVal(6) !== null ? Number(getVal(6)) : null,
        serviceRating: getVal(7) !== null ? Number(getVal(7)) : null,
        speedRating: getVal(8) !== null ? Number(getVal(8)) : null,
        cleanlinessRating: getVal(9) !== null ? Number(getVal(9)) : null,
        comments: getFormattedVal(10)
    };
};

const isValidFeedback = (item) => {
    return item.timestamp && item.timestamp.trim() !== '';
};

/**
 * Fetches Customer Feedback data from Google Sheets with SWR pattern caching.
 */
export const fetchCustomerFeedback = async (forceRefresh = false, onCacheHit = null) => {
    const cachedStr = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    let hasCache = false;

    if (cachedStr && cachedTime) {
        try {
            const parsed = JSON.parse(cachedStr);
            const age = Date.now() - parseInt(cachedTime, 10);
            hasCache = true;
            
            if (onCacheHit) onCacheHit(parsed);
            if (!forceRefresh && age < CACHE_DURATION) return parsed;
        } catch (e) {
            console.error('Feedback cache parsing error:', e);
        }
    }

    const sheetId = '102A3Yz7BlKDJB7I_0lmYd1ek1CA7HAZyIg4R8ZYFjcw';
    const gid = '1130350999';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

    try {
        const response = await fetch(url);
        const text = await response.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
        
        if (!match) {
            throw new Error('Could not parse Google Sheets response wrapper');
        }

        const json = JSON.parse(match[1]);
        const rows = json.table?.rows || [];
        const normalizedData = rows.map(mapRow).filter(isValidFeedback);

        localStorage.setItem(CACHE_KEY, JSON.stringify(normalizedData));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        return normalizedData;
    } catch (error) {
        console.error('Failed to fetch customer feedback data:', error);
        if (hasCache) {
            return JSON.parse(cachedStr);
        }
        return [];
    }
};
