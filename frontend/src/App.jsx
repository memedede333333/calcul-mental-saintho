import React, { useState, useCallback } from 'react';
import Layout from './components/Layout';
import Login from './screens/Login';
import Home from './screens/Home';
import Learn from './screens/Learn';
import Practice from './screens/Practice';
import Challenges from './screens/Challenges';
import Leaderboards from './screens/Leaderboards';
import Profile from './screens/Profile';
import Admin from './screens/Admin';

/**
 * App — Routeur principal
 * Login → Home → Modes (Learn, Practice, Challenges, Leaderboards, Profile, Admin)
 */
export default function App() {
    const [user, setUser] = useState(null);
    const [screen, setScreen] = useState('home');
    const goHome = useCallback(() => setScreen('home'), []);

    // Auth : si pas connecté, afficher le login
    if (!user) {
        return (
            <Layout showHeader={false}>
                <Login onLogin={(profil) => { setUser(profil); setScreen('home'); }} />
            </Layout>
        );
    }

    return (
        <Layout showHeader={screen === 'home'}>
            {screen === 'home' && <Home onGo={setScreen} user={user} />}
            {screen === 'learn' && <Learn onBack={goHome} />}
            {screen === 'play' && <Practice onBack={goHome} />}
            {screen === 'challenges' && <Challenges onBack={goHome} user={user} />}
            {screen === 'leaderboards' && <Leaderboards onBack={goHome} user={user} />}
            {screen === 'profile' && <Profile onBack={goHome} user={user} onLogout={() => { setUser(null); setScreen('home'); }} />}
            {screen === 'admin' && <Admin onBack={goHome} user={user} />}
        </Layout>
    );
}
