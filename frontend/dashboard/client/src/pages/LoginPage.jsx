import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulera login
        setTimeout(() => {
            setLoading(false);
            navigate("/");
        }, 1000);
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">P</div>
                <h1 className="login-title">Välkommen tillbaka</h1>
                <p className="login-subtitle">Logga in för att fortsätta till PricingIQ</p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        className="login-input"
                        placeholder="E-postadress"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        className="login-input"
                        placeholder="Lösenord"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button type="submit" className="login-button" disabled={loading}>
                        {loading ? "Loggar in..." : "Logga in"}
                    </button>
                </form>
            </div>
        </div>
    );
}