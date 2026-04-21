import { forwardRef } from "react";
import { cn } from "../../lib/utils";

const VARIANT_CLASSES = {
    primary: "btn btn--primary",
    secondary: "btn btn--secondary",
    ghost: "btn btn--ghost",
    danger: "btn btn--danger",
};

const SIZE_CLASSES = {
    sm: "btn--sm",
    md: "",
    lg: "btn--lg",
};

export const Button = forwardRef(
    ({ children, variant = "primary", size = "md", loading = false, disabled = false, className, ...props }, ref) => {
        const isDisabled = loading || disabled;

        return (
            <button
                ref={ref}
                className={cn(VARIANT_CLASSES[variant], SIZE_CLASSES[size], isDisabled && "btn--disabled", className)}
                disabled={isDisabled}
                {...props}
            >
                {loading && <span className="spinner spinner--sm" />}
                <span className={loading ? "btn__text--loading" : ""}>{children}</span>
            </button>
        );
    }
);

Button.displayName = "Button";
