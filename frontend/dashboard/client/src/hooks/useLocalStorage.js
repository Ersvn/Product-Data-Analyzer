import { useState, useEffect } from 'react';

export function useLocalStorage(key, initialValue) {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            if (!item) return initialValue;

            // Försök parsa som JSON först
            try {
                return JSON.parse(item);
            } catch {
                // Om det inte är JSON, använd värdet direkt (för bakåtkompatibilitet)
                return item;
            }
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return initialValue;
        }
    });

    const setValue = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);

            // Spara som JSON om det är ett objekt/array, annars som sträng
            const valueToSave = typeof valueToStore === 'string'
                ? valueToStore
                : JSON.stringify(valueToStore);

            window.localStorage.setItem(key, valueToSave);
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    };

    return [storedValue, setValue];
}