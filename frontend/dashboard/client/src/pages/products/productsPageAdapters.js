import { getProductImage } from "../../lib/productImageMap";

export function rowKeyFor(source, row) {
    if (!row) return "unknown";
    if (source === "inventory") return `inv:${row.__companyId ?? row.id ?? row.ean ?? row.mpn ?? "unknown"}`;
    return `mkt:${row.uid ?? row.__uid ?? row.ean ?? row.mpn ?? "unknown"}`;
}

export function normalizeInventoryRow(row) {
    const id = row?.id ?? null;

    const normalized = {
        id,
        __companyId: id,
        __dbCompanyId: id,
        __source: "db",

        name: row?.name ?? "",
        brand: row?.brand ?? "",
        category: row?.category ?? "",
        ean: row?.ean ?? null,
        mpn: row?.mpn ?? null,

        ourPrice: row?.our_price ?? row?.ourPrice ?? null,
        costPrice: row?.cost_price ?? row?.costPrice ?? null,
        priceMode: (row?.price_mode ?? row?.priceMode ?? "AUTO")?.toUpperCase?.() ?? "AUTO",
        manualPrice: row?.manual_price ?? row?.manualPrice ?? null,

        marketMatched: Boolean(row?.market_matched ?? row?.marketMatched ?? false),
        competitorCount: row?.competitor_count ?? row?.competitorCount ?? 0,

        imageUrl: row?.image_url ?? row?.imageUrl ?? getProductImage(row),
        url: row?.url ?? null,
    };

    return { ...normalized, __rowKey: rowKeyFor("inventory", normalized) };
}

export function normalizeMarketRow(row) {
    const uid = String(row?.uid ?? "").trim();

    const normalized = {
        uid,
        __uid: uid,
        __source: "dbMarket",

        name: row?.display_name ?? row?.name ?? uid ?? "",
        brand: row?.brand ?? "",
        ean: row?.ean ?? null,
        mpn: row?.mpn ?? null,

        recommendedPrice: row?.price_median ?? row?.priceMedian ?? null,
        effectivePrice: row?.price_median ?? row?.priceMedian ?? null,

        marketPriceMin: row?.price_min ?? row?.priceMin ?? null,
        marketPriceMax: row?.price_max ?? row?.priceMax ?? null,
        marketBenchmarkPrice: row?.price_median ?? row?.priceMedian ?? null,
        competitorCount: row?.offers_count ?? row?.offersCount ?? null,

        lastScraped: row?.last_scraped ?? row?.lastScraped ?? null,

        marketMatched: Boolean(row?.inventory_matched ?? row?.inventoryMatched ?? false),
        inventoryMatchCount: Number(row?.inventory_match_count ?? row?.inventoryMatchCount ?? 0),
        imageUrl: row?.image_url ?? row?.imageUrl ?? getProductImage(row),
    };

    return { ...normalized, __rowKey: rowKeyFor("market", normalized) };
}

export function isMatchedInventoryProduct(product) {
    return Boolean(product && product.__source === "db" && product.marketMatched);
}

export function isMatchedMarketRow(product) {
    return Boolean(product && product.__source === "dbMarket" && product.marketMatched);
}

export function getEffectivePrice(product) {
    const effective = Number(product?.effectivePrice);
    if (Number.isFinite(effective) && effective > 0) return effective;

    const mode = String(product?.priceMode ?? "AUTO").toUpperCase();
    if (mode === "MANUAL") {
        const manual = Number(product?.manualPrice);
        if (Number.isFinite(manual) && manual > 0) return manual;
    }

    const recommended = Number(product?.recommendedPrice);
    if (Number.isFinite(recommended) && recommended > 0) return recommended;

    const our = Number(product?.ourPrice);
    if (Number.isFinite(our) && our > 0) return our;

    const price = Number(product?.price);
    if (Number.isFinite(price) && price > 0) return price;

    return null;
}

export function filterAndSortRows(rows, source, query) {
    const q = String(query ?? "").trim().toLowerCase();

    if (source === "inventory") {
        let filtered = rows;

        if (q === "matched") {
            filtered = rows.filter(isMatchedInventoryProduct);
        } else if (q === "inventory only" || q === "inventory" || q === "unmatched") {
            filtered = rows.filter((row) => !isMatchedInventoryProduct(row));
        }

        return [...filtered].sort((a, b) => {
            const aMatched = isMatchedInventoryProduct(a) ? 1 : 0;
            const bMatched = isMatchedInventoryProduct(b) ? 1 : 0;

            if (aMatched !== bMatched) return bMatched - aMatched;

            const aName = String(a?.name ?? "").toLocaleLowerCase("sv-SE");
            const bName = String(b?.name ?? "").toLocaleLowerCase("sv-SE");
            return aName.localeCompare(bName, "sv-SE");
        });
    }

    let filtered = rows;

    if (q === "matched") {
        filtered = rows.filter(isMatchedMarketRow);
    } else if (q === "unmatched" || q === "market only") {
        filtered = rows.filter((row) => !isMatchedMarketRow(row));
    }

    return [...filtered].sort((a, b) => {
        const aMatched = isMatchedMarketRow(a) ? 1 : 0;
        const bMatched = isMatchedMarketRow(b) ? 1 : 0;

        if (aMatched !== bMatched) return bMatched - aMatched;

        const aName = String(a?.name ?? "").toLocaleLowerCase("sv-SE");
        const bName = String(b?.name ?? "").toLocaleLowerCase("sv-SE");
        return aName.localeCompare(bName, "sv-SE");
    });
}
