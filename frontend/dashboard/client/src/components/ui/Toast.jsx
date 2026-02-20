import { useEffect } from 'react';

export function ToastContainer({ toasts, onRemove }) {
    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast key={toast.id} {...toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

function Toast({ id, message, type, duration, onRemove }) {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(id), duration);
        return () => clearTimeout(timer);
    }, [id, duration, onRemove]);

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };

    return (
        <div className={`toast toast--${type}`}>
            <span className="toast__icon">{icons[type]}</span>
            <span className="toast__message">{message}</span>
            <button className="toast__close" onClick={() => onRemove(id)}>×</button>
        </div>
    );
}