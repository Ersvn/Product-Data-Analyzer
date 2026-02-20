import { Button } from './Button';

export function ErrorState({ error, retry }) {
    return (
        <div className="error-state">
            <div className="error-state__icon">⚠️</div>
            <h3 className="error-state__title">Något gick fel</h3>
            <p className="error-state__message">{error?.message || 'Okänt fel'}</p>
            {retry && (
                <Button onClick={retry} variant="secondary">
                    Försök igen
                </Button>
            )}
        </div>
    );
}