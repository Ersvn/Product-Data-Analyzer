import { forwardRef } from "react";

export const Input = forwardRef(({ className = "", style, icon, ...props }, ref) => {
    return (
        <div
            className={`inputWrap${icon ? " inputWrap--with-icon" : ""}${className ? ` ${className}` : ""}`}
            style={{ width: style?.width || "100%" }}
        >
            {icon && (
                <span className="inputWrap__icon">
                    {icon}
                </span>
            )}
            <input
                ref={ref}
                className="input"
                style={{
                    ...style,
                }}
                {...props}
            />
        </div>
    );
});

Input.displayName = "Input";
