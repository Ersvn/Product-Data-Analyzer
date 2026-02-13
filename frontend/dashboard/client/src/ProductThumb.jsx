export default function ProductThumb({ src, alt }) {
    return (
        <div
            style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                border: "1px solid var(--stroke)",
                background: "var(--panel2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
            }}
        >
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                    }}
                    onError={(e) => {
                        e.currentTarget.style.display = "none";
                    }}
                />
            ) : (
                <span style={{ fontSize: 18, opacity: 0.4 }}>📦</span>
            )}
        </div>
    );
}
