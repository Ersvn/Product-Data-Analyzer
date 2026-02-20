import { forwardRef } from 'react';

export const Input = forwardRef(({ className, style, icon, ...props }, ref) => {
    return (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: style?.width || '100%' }}>
            {icon && (
                <span style={{
                    position: 'absolute',
                    left: 14,
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    zIndex: 1,
                }}>
                    {icon}
                </span>
            )}
                <input
                    ref={ref}
                    style={{
                        width: '100%',
                        padding: icon ? '12px 16px 12px 44px' : '12px 16px',
                        borderRadius: 12,
                        border: '1px solid var(--glass-border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        fontSize: 14,
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        outline: 'none',
                        boxShadow: 'var(--shadow-sm)',
                        ...style,
                    }}
                    onFocus={(e) => {
                        e.target.style.borderColor = 'var(--accent)';
                        e.target.style.boxShadow = '0 0 0 3px var(--accent-glow), var(--shadow-md)';
                    }}
                    onBlur={(e) => {
                        e.target.style.borderColor = 'var(--glass-border)';
                        e.target.style.boxShadow = 'var(--shadow-sm)';
                    }}
                    {...props}
                />
        </div>
    );
});

Input.displayName = 'Input';