import { useState } from "react";

export default function ProductThumb({ src, alt, size = 44 }) {
    const [broken, setBroken] = useState(false);
    const showImage = Boolean(src) && !broken;

    return (
        <div className="product-thumb" style={{ width: size, height: size }}>
            {showImage ? (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    className="product-thumb__img"
                    onError={() => setBroken(true)}
                />
            ) : (
                <span className="product-thumb__fallback">IMG</span>
            )}
        </div>
    );
}
