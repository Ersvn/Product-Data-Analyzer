import { Button } from './Button';

export function ErrorState({ error, retry }) {
    return (
        <div className="error-state">
            <div className="error-state__icon">⚠️</div>
            <h3 className="error-state__title">Something went wrong</h3>
            <p className="error-state__message">{error?.message || 'Unknown error'}</p>
            {retry && (
                <Button onClick={retry} variant="secondary">
                    Try again
                </Button>
            )}
        </div>
    );
}