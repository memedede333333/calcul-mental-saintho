import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Login from './screens/Login';
import Home from './screens/Home';
import Learn from './screens/Learn';
import Practice from './screens/Practice';
import Challenges from './screens/Challenges';
import Leaderboards from './screens/Leaderboards';
import Profile from './screens/Profile';
import Admin from './screens/Admin';
import MesDefis from './screens/MesDefis';
import MaClasse from './screens/MaClasse';
import { sessionActive, quiSuisJe, seDeconnecter, viderFile, monProfil } from './api';
import branding from './branding';

/**
 * App — Routeur principal + restauration de session
 *
 * Au montage :
 *   sessionActive()  →  faux : login
 *                    →  vrai : quiSuisJe()  →  eleve / prof : ready
 *                                           →  inconnu      : écran dédié
 *
 * L'objet `identite` est stocké tel que renvoyé par quiSuisJe() :
 *   - { type: 'eleve', profil: { id, prenom, nom, classe, ... } }
 *   - { type: 'prof', admin: bool, profil: { id, nom, email, ... } }
 *   - { type: 'inconnu', message: "..." }
 *
 * On ne l'aplatit JAMAIS en un seul objet — chaque écran lit les
 * champs selon le type.
 */
export default function App() {
    // identite : réponse brute de quiSuisJe(), null tant que pas chargée
    const [identite, setIdentite] = useState(null);
    // appState : loading | login | inconnu | erreur | ready
    const [appState, setAppState] = useState('loading');
    const [erreurMessage, setErreurMessage] = useState('');
    const [screen, setScreen] = useState('home');
    const [tablesADemarrer, setTablesADemarrer] = useState(null);
    // Pré-remplissage depuis "Ma classe" : { tables: [7,8], classe: '6A' }
    const [defiPreConfig, setDefiPreConfig] = useState(null);
    const [maitrise, setMaitrise] = useState({});

    const estProf = identite?.type === 'prof';
    const estAdmin = identite?.admin === true;

    // --- Restauration de session au montage ---
    useEffect(() => {
        let annule = false;

        async function demarrer() {
            try {
                const actif = await sessionActive();
                if (annule) return;

                if (!actif) {
                    setAppState('login');
                    return;
                }

                // Session présente → identifier l'utilisateur
                const res = await quiSuisJe();
                if (annule) return;

                if (!res.ok) {
                    // Session valide mais serveur injoignable : ne PAS
                    // envoyer au login, sinon boucle de redirection Google.
                    setErreurMessage(res.error || 'Le serveur ne répond pas.');
                    setAppState('erreur');
                    return;
                }

                traiterIdentite(res.data);
            } catch (e) {
                if (!annule) {
                    setErreurMessage('Le serveur ne répond pas. Vérifie ta connexion.');
                    setAppState('erreur');
                }
            }
        }

        demarrer();
        return () => { annule = true; };
    }, []);

    // --- Traitement centralisé de la réponse quiSuisJe ---
    function traiterIdentite(data) {
        setIdentite(data);
        if (data.type === 'eleve' || data.type === 'prof') {
            setScreen('home');
            setAppState('ready');
            // Vider la file d'attente hors-ligne maintenant qu'on a une
            // session identifiée — pas avant, sinon viderFile() jette
            // les parties faute de permission.
            viderFile().catch(() => {});
            // Charger la grille de maîtrise — un seul appel, réutilisée
            // par Practice et Challenges pour pondérer les tirages.
            if (data.type === 'eleve') {
                monProfil().then(res => {
                    if (res.ok && res.data?.maitrise) {
                        setMaitrise(res.data.maitrise);
                    }
                }).catch(() => {});
            }
        } else {
            // type === 'inconnu' ou inattendu
            setAppState('inconnu');
        }
    }

    // --- Rafraîchir l'identité après un changement de rôle ---
    const refreshIdentite = useCallback(async () => {
        const res = await quiSuisJe();
        if (res.ok) {
            setIdentite(res.data);
            // Si le compte n'est plus admin/prof, revenir à l'accueil
            if (res.data.type !== 'prof' && res.data.type !== 'eleve') {
                setScreen('home');
            }
        }
    }, []);

    // --- Réessayer après erreur serveur ---
    const handleReessayer = useCallback(async () => {
        setAppState('loading');
        setErreurMessage('');
        try {
            const res = await quiSuisJe();
            if (!res.ok) {
                setErreurMessage(res.error || 'Le serveur ne répond pas.');
                setAppState('erreur');
                return;
            }
            traiterIdentite(res.data);
        } catch {
            setErreurMessage('Le serveur ne répond pas. Vérifie ta connexion.');
            setAppState('erreur');
        }
    }, []);

    // --- Déconnexion ---
    const handleDeconnexion = useCallback(async () => {
        await seDeconnecter();
        setIdentite(null);
        setScreen('home');
        setAppState('login');
    }, []);

    // --- Callback pour Login ---
    // Reçoit la réponse brute de quiSuisJe() après connexion réussie
    const handleIdentite = useCallback((data) => {
        traiterIdentite(data);
    }, []);

    const goHome = useCallback(() => { setScreen('home'); setTablesADemarrer(null); }, []);

    // --- Navigation vers Practice avec des tables pré-sélectionnées ---
    // Utilisé par Profile → « Réviser mes cases rouges »
    const goPlayWithTables = useCallback((tables) => {
        setTablesADemarrer(tables);
        setScreen('play');
    }, []);

    // --- Mise à jour du plafond après une Montée réussie ---
    const handlePlafondChange = useCallback((nouveauPlafond) => {
        setIdentite(prev => {
            if (!prev?.profil) return prev;
            return {
                ...prev,
                profil: { ...prev.profil, plafond_tables: nouveauPlafond },
            };
        });
    }, []);

    // ====================== RENDU ======================

    // 1. Chargement
    if (appState === 'loading') {
        return (
            <Layout showHeader={false}>
                <div className="screen-enter" style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: 20,
                }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: 16,
                        background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))',
                        color: 'var(--gold)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 800,
                        fontSize: 24, letterSpacing: 2,
                    }}>
                        {branding.monogram}
                    </div>
                    <div className="spinner" aria-label="Chargement" />
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 700,
                        fontSize: 14,
                    }}>
                        Chargement…
                    </p>
                </div>
            </Layout>
        );
    }

    // 2. Login
    if (appState === 'login') {
        return (
            <Layout showHeader={false}>
                <Login onIdentite={handleIdentite} />
            </Layout>
        );
    }

    // 3. Erreur serveur (session valide mais serveur injoignable)
    if (appState === 'erreur') {
        return (
            <Layout showHeader={false}>
                <div className="screen-enter" style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: 16, textAlign: 'center',
                    padding: '0 24px',
                }}>
                    <span style={{ fontSize: 56 }}>📡</span>
                    <h2 className="font-display" style={{
                        fontSize: 22, fontWeight: 800, color: 'var(--navy)',
                    }}>
                        Le serveur ne répond pas
                    </h2>
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 600,
                        fontSize: 15, lineHeight: 1.5, maxWidth: 340,
                    }}>
                        {erreurMessage}
                    </p>
                    <button
                        className="btn btn--navy"
                        style={{ marginTop: 8, fontSize: 16, padding: '14px 32px' }}
                        onClick={handleReessayer}
                    >
                        Réessayer
                    </button>
                    <button
                        className="btn btn--ghost"
                        style={{ fontSize: 14, padding: '10px 24px', color: 'var(--coral)' }}
                        onClick={handleDeconnexion}
                    >
                        Se déconnecter
                    </button>
                </div>
            </Layout>
        );
    }

    // 4. Compte non reconnu
    if (appState === 'inconnu') {
        return (
            <Layout showHeader={false}>
                <div className="screen-enter" style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', gap: 16, textAlign: 'center',
                    padding: '0 24px',
                }}>
                    <span style={{ fontSize: 56 }}>🔒</span>
                    <h2 className="font-display" style={{
                        fontSize: 22, fontWeight: 800, color: 'var(--navy)',
                    }}>
                        Compte non reconnu
                    </h2>
                    <p style={{
                        color: 'var(--text-soft)', fontWeight: 600,
                        fontSize: 15, lineHeight: 1.5, maxWidth: 340,
                    }}>
                        {identite?.message || 'Ce compte n\'est pas reconnu. Demande à ton professeur.'}
                    </p>
                    <button
                        className="btn btn--coral"
                        style={{ marginTop: 12, fontSize: 16, padding: '14px 32px' }}
                        onClick={handleDeconnexion}
                    >
                        Se déconnecter
                    </button>
                </div>
            </Layout>
        );
    }

    // 4. Application (ready)
    return (
        <Layout showHeader={screen === 'home'}>
            {screen === 'home' && (
                <Home
                    onGo={setScreen}
                    identite={identite}
                    estProf={estProf}
                    estAdmin={estAdmin}
                    onLogout={handleDeconnexion}
                />
            )}
            {screen === 'learn' && <Learn onBack={goHome} />}
            {screen === 'play' && (
                <Practice
                    onBack={goHome}
                    identite={identite}
                    estProf={estProf}
                    onPlafondChange={handlePlafondChange}
                    tablesInitiales={tablesADemarrer}
                    maitrise={maitrise}
                />
            )}
            {screen === 'challenges' && (
                <Challenges onBack={goHome} identite={identite} estProf={estProf} onPlafondChange={handlePlafondChange} maitrise={maitrise} onGo={setScreen} defiPreConfig={defiPreConfig} clearPreConfig={() => setDefiPreConfig(null)} />
            )}
            {screen === 'mes-defis' && (
                <MesDefis onBack={goHome} estProf={estProf} />
            )}
            {screen === 'classe' && (
                <MaClasse
                    onBack={goHome}
                    onLancerDefi={(tables, classe) => {
                        setDefiPreConfig({ tables, classe });
                        setScreen('challenges');
                    }}
                />
            )}
            {screen === 'leaderboards' && (
                <Leaderboards onBack={goHome} identite={identite} estProf={estProf} />
            )}
            {screen === 'profile' && (
                <Profile
                    onBack={goHome}
                    identite={identite}
                    estProf={estProf}
                    onLogout={handleDeconnexion}
                    onReviser={goPlayWithTables}
                    onGo={setScreen}
                />
            )}
            {screen === 'admin' && estAdmin && (
                <Admin onBack={goHome} identite={identite} onIdentiteChange={refreshIdentite} />
            )}
        </Layout>
    );
}
