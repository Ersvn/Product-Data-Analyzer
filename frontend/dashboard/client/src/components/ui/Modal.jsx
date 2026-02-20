import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

export function Modal({ open, onClose, children, className, title }) {
    const overlayRef = useRef();

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };

        if (open) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="modal-overlay"
            ref={overlayRef}
            onClick={(e) => e.target === overlayRef.current && onClose()}
        >
            <div className={cn('modal', className)}>
                {title && (
                    <div className="modal__header">
                        <h3 className="modal__title">{title}</h3>
                        <button className="modal__close" onClick={onClose}>×</button>
                    </div>
                )}
                <div className="modal__content">{children}</div>
            </div>
        </div>
    );
}