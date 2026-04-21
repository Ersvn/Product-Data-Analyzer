import { cn } from "../../lib/utils";

export function Badge({ children, variant = "default", size = "md" }) {
    return <span className={cn("badge", `badge--${variant}`, `badge--${size}`)}>{children}</span>;
}
