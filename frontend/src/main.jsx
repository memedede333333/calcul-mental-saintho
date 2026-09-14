import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

class RootErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Crash intercepté par RootErrorBoundary :", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: 'var(--ivoire)',
                    padding: 24, textAlign: 'center', fontFamily: 'var(--texte)',
                }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: 16, background: 'var(--indigo)',
                        color: 'var(--podium)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontFamily: 'var(--titre)', fontWeight: 800,
                        fontSize: 24, marginBottom: 16,
                    }}>
                        mH
                    </div>
                    <h2 style={{ fontFamily: 'var(--titre)', fontSize: 24, fontWeight: 700, color: 'var(--indigo)', margin: '0 0 8px' }}>
                        Une erreur est survenue
                    </h2>
                    <p style={{ color: 'var(--gris)', fontSize: 15, maxWidth: 360, margin: '0 0 20px', lineHeight: 1.5 }}>
                        L'application a rencontré un problème inattendu lors du chargement.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                            height: 48, padding: '0 24px', borderRadius: 999,
                            background: 'var(--action)', color: '#ffffff',
                            border: 'none', fontFamily: 'var(--texte)', fontWeight: 700,
                            fontSize: 16, cursor: 'pointer', boxShadow: 'var(--ombre-action)',
                        }}
                    >
                        Recharger l'application
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <RootErrorBoundary>
            <App />
        </RootErrorBoundary>
    </React.StrictMode>
);
