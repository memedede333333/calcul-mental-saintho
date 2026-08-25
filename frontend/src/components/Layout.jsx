import React, { useState } from 'react';
import branding from '../branding';

/**
 * Layout — Shell commun de l'application
 * Header avec logo (ou monogramme fallback), titre, baseline
 */
export default function Layout({ children, showHeader = true }) {
    const [logoError, setLogoError] = useState(false);

    return (
        <div className="app-root">
            <div className="app-stage">
                {showHeader && (
                    <header className="app-header">
                        {!logoError ? (
                            <img
                                src={branding.logoPath}
                                alt={branding.appName}
                                className="app-header-logo"
                                onError={() => setLogoError(true)}
                            />
                        ) : (
                            <div className="app-header-monogram">{branding.monogram}</div>
                        )}
                        <div className="app-header-text">
                            <h1 className="app-title">{branding.appName}</h1>
                            <p className="app-baseline">{branding.baseline}</p>
                        </div>
                    </header>
                )}
                {children}
            </div>
        </div>
    );
}
