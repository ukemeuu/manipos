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
        comments: getFormattedVal(10),
        photoUrl: getFormattedVal(11)
    };
};

const isValidFeedback = (item) => {
    return item.timestamp && item.timestamp.trim() !== '' && item.timestamp.toLowerCase() !== 'timestamp';
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
    // Try both tab name "Feedback" (where Apps Script appends rows) and GID fallback
    const urls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Feedback`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=1130350999`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const text = await response.text();
            const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
            
            if (!match) continue;

            const json = JSON.parse(match[1]);
            const rows = json.table?.rows || [];
            const normalizedData = rows.map(mapRow).filter(isValidFeedback);

            if (normalizedData.length > 0) {
                localStorage.setItem(CACHE_KEY, JSON.stringify(normalizedData));
                localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
                return normalizedData;
            }
        } catch (error) {
            console.warn(`Failed fetch attempt from ${url}:`, error);
        }
    }

    if (hasCache) {
        return JSON.parse(cachedStr);
    }
    return [];
};

/**
 * Fetches Google Business Reviews from Google Spreadsheet tab "Google_Reviews"
 */
export const fetchGoogleReviewsFromSheet = async () => {
    const sheetId = '102A3Yz7BlKDJB7I_0lmYd1ek1CA7HAZyIg4R8ZYFjcw';
    const urls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Google_Reviews`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=GoogleReviews`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Reviews`
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const text = await response.text();
            const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
            if (!match) continue;

            const json = JSON.parse(match[1]);
            const rows = json.table?.rows || [];

            const reviews = rows.map((r, i) => {
                const cells = r.c || [];
                const getStr = (idx) => cells[idx]?.f !== undefined ? cells[idx].f : (cells[idx]?.v !== undefined ? String(cells[idx].v) : '');
                const getNum = (idx) => cells[idx]?.v !== undefined ? Number(cells[idx].v) : 5;

                const name = getStr(1) || getStr(0) || `Guest #${i + 1}`;
                if (!name || name.toLowerCase() === 'author' || name.toLowerCase() === 'name') return null;

                return {
                    id: `g-sheet-rev-${i}`,
                    authorName: name,
                    rating: getNum(2) || 5,
                    relativeTime: getStr(0) || 'Recently',
                    text: getStr(3) || 'Great food and service.',
                    isReplied: getStr(4).toLowerCase() === 'true' || getStr(4).toLowerCase() === 'replied' || Boolean(getStr(5)),
                    replyText: getStr(5) || null,
                    replyDate: getStr(6) || null
                };
            }).filter(Boolean);

            if (reviews.length > 0) return reviews;
        } catch (e) {
            console.warn('Google reviews sheet fetch error:', e);
        }
    }
    return null;
};
