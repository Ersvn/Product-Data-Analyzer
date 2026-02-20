import { Button } from './Button';

export function LoadingButton({ loading, children, ...props }) {
    return (
        <Button loading={loading} {...props}>
            {children}
        </Button>
    );
}