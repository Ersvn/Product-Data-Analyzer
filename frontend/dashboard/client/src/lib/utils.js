export function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}

export function formatMoney(value, currency = 'kr') {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toLocaleString('sv-SE')} ${currency}`;
}

export function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('sv-SE');
}

export function formatPercent(value, decimals = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
}

export function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

export function throttle(fn, limit) {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

export function downloadCSV(data, filename) {
    const csv = convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

function convertToCSV(data) {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
        headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
}

export function getInitials(name) {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}