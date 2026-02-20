import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

export default function NotFoundPage() {
    return (
        <div className="error-page">
            <div className="error-content">
                <div className="error-code">404</div>
                <h1 className="error-title">Sidan hittades inte</h1>
                <p className="error-message">
                    Sidan du letar efter finns inte eller har flyttats.
                    Kontrollera URL:en eller gå tillbaka till dashboarden.
                </p>
                <div className="error-actions">
                    <Button as={Link} to="/" variant="primary">
                        Till Dashboard
                    </Button>
                    <Button as={Link} to="/products" variant="ghost">
                        Till Produkter
                    </Button>
                </div>
            </div>
        </div>
    );
}