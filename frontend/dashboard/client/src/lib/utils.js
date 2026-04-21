export function cn(...classes) {
    return classes.filter(Boolean).join(" ");
}

export function formatMoney(value, currency = "kr") {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return `${num.toLocaleString("sv-SE")} ${currency}`;
}

export function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return num.toLocaleString("sv-SE");
}

export function downloadCSV(data, filename) {
    const csv = convertToCSV(data);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

function convertToCSV(data) {
    if (!data.length) return "";
    const headers = Object.keys(data[0]);

    const rows = data.map((row) =>
        headers
            .map((header) => {
                const rawValue = String(row[header] || "");
                const escapedValue = rawValue.replace(/"/g, '""');

                if (header === "EAN" || header === "MPN" || header === "UID") {
                    return `="${escapedValue}"`;
                }

                return `"${escapedValue}"`;
            })
            .join(";")
    );

    return [headers.join(";"), ...rows].join("\n");
}
