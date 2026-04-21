import { cn } from "../../../lib/utils";

export default function PriceModeBadge({ priceMode, manualPrice, size = "sm" }) {
    const mode = String(priceMode || "AUTO").toUpperCase();
    const isManual = mode === "MANUAL" && manualPrice != null;

    return (
        <span className={cn("pmBadge", isManual ? "pmBadge--manual" : "pmBadge--auto", `pmBadge--${size}`)}>
            {isManual ? "Manual" : "Auto"}
        </span>
    );
}
