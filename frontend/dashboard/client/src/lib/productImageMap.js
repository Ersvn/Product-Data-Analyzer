const PRODUCT_IMAGE_MAP = {
    "12195949544200": "/product-images/airpods.png",
    "7394291100024": "/product-images/1248207_1.png",
    "4711387470633": "/product-images/1303224.png",
};

export function getProductImage(row) {
    if (!row) return null;

    const ean = String(row.ean ?? "").trim();
    const mpn = String(row.mpn ?? "").trim().toUpperCase();

    return PRODUCT_IMAGE_MAP[ean] ?? PRODUCT_IMAGE_MAP[mpn] ?? null;
}
