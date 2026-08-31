import { supabase } from './supabase';

const LOCAL_STORAGE_KEY = 'poj_qr_scan_logs_v1';
const VISITOR_ID_KEY = 'poj_visitor_uuid';
const LAST_SCAN_TIME_KEY = 'poj_last_scan_ts';

/**
 * Detect device type and OS from navigator.userAgent
 */
export function getDeviceInfo() {
    if (typeof window === 'undefined' || !navigator) {
        return { device: 'Unknown', os: 'Unknown', isMobile: false };
    }

    const ua = navigator.userAgent || '';
    let os = 'Desktop';
    let device = 'Computer';
    let isMobile = false;

    if (/iPhone/i.test(ua)) {
        os = 'iOS';
        device = 'iPhone';
        isMobile = true;
    } else if (/iPad/i.test(ua)) {
        os = 'iPadOS';
        device = 'iPad';
        isMobile = true;
    } else if (/Android/i.test(ua)) {
        os = 'Android';
        device = /Mobile/i.test(ua) ? 'Android Phone' : 'Android Tablet';
        isMobile = true;
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
        os = 'macOS';
        device = 'Mac';
    } else if (/Windows/i.test(ua)) {
        os = 'Windows';
        device = 'PC';
    } else if (/Linux/i.test(ua)) {
        os = 'Linux';
        device = 'PC';
    }

    return {
        device,
        os,
        isMobile,
        userAgent: ua
    };
}

/**
 * Get or create unique visitor UUID
 */
export function getVisitorId() {
    try {
        let vid = localStorage.getItem(VISITOR_ID_KEY);
        if (!vid) {
            vid = 'v_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
            localStorage.setItem(VISITOR_ID_KEY, vid);
        }
        return vid;
    } catch (e) {
        return 'v_anon_' + Date.now();
    }
}

/**
 * Record a QR Code Scan Event
 */
export async function recordQrScan({
    qr_code_id = null,
    qr_label = 'Receipt Feedback QR',
    destination_url = '',
    channel = 'Receipt',
    order_id = null,
    ticket_number = null,
    source = 'qr_scan'
} = {}) {
    try {
        const now = new Date();
        const nowTs = now.getTime();

        // Prevent duplicate rapid logging on refresh within 10 seconds
        try {
            const lastScanStr = sessionStorage.getItem(LAST_SCAN_TIME_KEY);
            if (lastScanStr && (nowTs - parseInt(lastScanStr, 10)) < 10000) {
                return { skipped: true, reason: 'debounced' };
            }
            sessionStorage.setItem(LAST_SCAN_TIME_KEY, nowTs.toString());
        } catch (e) {}

        const dev = getDeviceInfo();
        const visitorId = getVisitorId();
        const destUrl = destination_url || (typeof window !== 'undefined' ? window.location.href : '');

        // Extract URL params if any
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (!order_id && params.get('order_id')) order_id = params.get('order_id');
            if (!ticket_number && params.get('ticket')) ticket_number = params.get('ticket');
            if (params.get('ch')) channel = params.get('ch');
            if (params.get('src')) source = params.get('src');
            if (params.get('qr_id')) qr_code_id = params.get('qr_id');
            if (params.get('label')) qr_label = params.get('label');
        }

        const scanPayload = {
            id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            qr_code_id: qr_code_id || 'feedback_qr',
            qr_label: qr_label,
            destination_url: destUrl,
            device_type: dev.device,
            channel: channel || (dev.isMobile ? 'Mobile Scan' : 'Direct Visit'),
            order_id: order_id || null,
            ticket_number: ticket_number || null,
            user_agent: dev.userAgent || '',
            referrer: typeof document !== 'undefined' ? (document.referrer || 'Camera/Direct Scan') : '',
            session_id: visitorId,
            scanned_at: now.toISOString()
        };

        // 1. Save to LocalStorage cache immediately for fast offline access
        try {
            const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
            const logs = existingRaw ? JSON.parse(existingRaw) : [];
            logs.unshift(scanPayload);
            // Keep latest 500 scans in local storage
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs.slice(0, 500)));
        } catch (e) {}

        // 2. Insert into Supabase `qr_scans`
        try {
            const { error } = await supabase.from('qr_scans').insert([{
                qr_code_id: scanPayload.qr_code_id,
                qr_label: scanPayload.qr_label,
                destination_url: scanPayload.destination_url,
                device_type: scanPayload.device_type,
                channel: scanPayload.channel,
                order_id: scanPayload.order_id,
                ticket_number: scanPayload.ticket_number,
                user_agent: scanPayload.user_agent,
                referrer: scanPayload.referrer,
                session_id: scanPayload.session_id,
                scanned_at: scanPayload.scanned_at
            }]);
            if (error) {
                // If table does not exist or RLS blocks, fallback is preserved in localStorage
                console.warn('Supabase qr_scans logging notice:', error.message);
            }
        } catch (dbErr) {
            console.warn('Supabase qr_scans error:', dbErr);
        }

        return { success: true, scan: scanPayload };
    } catch (err) {
        console.error('Failed to record QR scan:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch all QR scan logs with pagination & fallback
 */
export async function fetchAllQrScans() {
    let scans = [];

    // Try Supabase first
    try {
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('qr_scans')
                .select('*')
                .order('scanned_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                break;
            }

            if (data && data.length > 0) {
                scans = scans.concat(data);
                if (data.length < pageSize) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
        }
    } catch (e) {
        console.warn('Error fetching from Supabase qr_scans:', e);
    }

    // Merge with LocalStorage cache
    try {
        const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localRaw) {
            const localLogs = JSON.parse(localRaw);
            const existingIds = new Set(scans.map(s => s.id || s.scanned_at));
            localLogs.forEach(l => {
                if (!existingIds.has(l.id) && !existingIds.has(l.scanned_at)) {
                    scans.push(l);
                }
            });
        }
    } catch (e) {}

    // Sort by scanned_at descending
    scans.sort((a, b) => new Date(b.scanned_at || 0) - new Date(a.scanned_at || 0));

    return scans;
}

/**
 * Compute aggregate QR scan statistics
 */
export function calculateQrScanMetrics(scans = [], timeFilter = 'all') {
    const now = new Date();
    const todayStr = now.toDateString();
    
    // Start of this week (Monday)
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);

    // Start of this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filter scans by time if requested
    const filteredScans = scans.filter(s => {
        if (!s.scanned_at) return true;
        const d = new Date(s.scanned_at);
        if (timeFilter === 'today') return d.toDateString() === todayStr;
        if (timeFilter === 'week') return d >= monday;
        if (timeFilter === 'month') return d >= startOfMonth;
        return true;
    });

    const totalScans = filteredScans.length;
    const uniqueSessions = new Set(filteredScans.map(s => s.session_id || s.id)).size;

    let scansToday = 0;
    let scansThisWeek = 0;
    let scansThisMonth = 0;

    const byQrMap = {};
    const byDeviceMap = {};
    const byChannelMap = {};
    const byDayMap = {};
    const byHourMap = {};

    scans.forEach(s => {
        if (!s.scanned_at) return;
        const d = new Date(s.scanned_at);
        const dayStr = d.toISOString().substring(0, 10);
        const hour = d.getHours();

        if (d.toDateString() === todayStr) scansToday++;
        if (d >= monday) scansThisWeek++;
        if (d >= startOfMonth) scansThisMonth++;

        // Group by QR Code / Label
        const qrKey = s.qr_label || s.qr_code_id || 'Receipt Feedback QR';
        if (!byQrMap[qrKey]) {
            byQrMap[qrKey] = { label: qrKey, count: 0, unique: new Set(), lastScanned: null };
        }
        byQrMap[qrKey].count++;
        byQrMap[qrKey].unique.add(s.session_id || s.id);
        if (!byQrMap[qrKey].lastScanned || new Date(s.scanned_at) > new Date(byQrMap[qrKey].lastScanned)) {
            byQrMap[qrKey].lastScanned = s.scanned_at;
        }

        // Group by Device
        const dev = s.device_type || 'iPhone';
        byDeviceMap[dev] = (byDeviceMap[dev] || 0) + 1;

        // Group by Channel
        const ch = s.channel || 'Receipt';
        byChannelMap[ch] = (byChannelMap[ch] || 0) + 1;

        // Daily trend
        byDayMap[dayStr] = (byDayMap[dayStr] || 0) + 1;

        // Hourly trend
        byHourMap[hour] = (byHourMap[hour] || 0) + 1;
    });

    const qrBreakdown = Object.values(byQrMap).map(item => ({
        label: item.label,
        count: item.count,
        uniqueCount: item.unique.size,
        lastScanned: item.lastScanned
    })).sort((a, b) => b.count - a.count);

    const deviceBreakdown = Object.entries(byDeviceMap).map(([device, count]) => ({
        device,
        count,
        percent: totalScans > 0 ? Math.round((count / totalScans) * 100) : 0
    })).sort((a, b) => b.count - a.count);

    const dailyTrend = Object.entries(byDayMap).map(([date, count]) => ({
        date,
        count
    })).sort((a, b) => a.date.localeCompare(b.date));

    return {
        totalScans,
        uniqueVisitors: uniqueSessions,
        scansToday,
        scansThisWeek,
        scansThisMonth,
        qrBreakdown,
        deviceBreakdown,
        dailyTrend,
        recentScans: filteredScans.slice(0, 50)
    };
}
