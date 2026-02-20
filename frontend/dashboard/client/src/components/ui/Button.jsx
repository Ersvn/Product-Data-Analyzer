import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Button = forwardRef(({
                                      children,
                                      variant = 'primary',
                                      size = 'md',
                                      loading = false,
                                      disabled = false,
                                      className,
                                      ...props
                                  }, ref) => {
    const variants = {
        primary: 'btn btn--primary',
        secondary: 'btn btn--secondary',
        ghost: 'btn btn--ghost',
        danger: 'btn btn--danger',
    };

    const sizes = {
        sm: 'btn--sm',
        md: '',
        lg: 'btn--lg',
    };

    return (
        <button
            ref={ref}
            className={cn(variants[variant], sizes[size], (loading || disabled) && 'btn--disabled', className)}
            disabled={loading || disabled}
            {...props}
        >
            {loading && <span className="spinner spinner--sm" />}
            <span className={loading ? 'btn__text--loading' : ''}>{children}</span>
        </button>
    );
});

Button.displayName = 'Button';