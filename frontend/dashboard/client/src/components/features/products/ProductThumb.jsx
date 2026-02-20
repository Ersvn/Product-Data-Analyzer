export default function ProductThumb({ src, alt, size = 44 }) {
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                border: '1px solid var(--glass-border)',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<span style="font-size: 20px; opacity: 0.5;">📦</span>';
                    }}
                />
            ) : (
                <span style={{ fontSize: 20, opacity: 0.5 }}>📦</span>
            )}
        </div>
    );
}