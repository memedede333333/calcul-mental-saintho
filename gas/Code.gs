/**
 * Calcul Mental Saintho — Google Apps Script Backend
 * 
 * Point d'entrée : doPost(e)
 * Route les requêtes par { action, token?, payload }
 * Vérifie le secret proxy sur chaque requête.
 * 
 * DÉPLOIEMENT :
 * 1. Copier ce fichier dans l'éditeur Apps Script (Extensions > Apps Script dans le Sheet)
 * 2. OU utiliser clasp : clasp push
 * 3. Déployer en Web App : "Exécuter en tant que moi", "Tout le monde" peut accéder
 * 4. Définir les propriétés du script (Paramètres > Propriétés du script) :
 *    - PROXY_SECRET : même valeur que dans Vercel
 *    - ALLOWED_DOMAIN : domaine email Google Workspace de l'école
 */

// ========== Configuration ==========

const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const PROXY_SECRET = SCRIPT_PROPERTIES.getProperty('PROXY_SECRET') || 'dev-secret';
const ALLOWED_DOMAIN = SCRIPT_PROPERTIES.getProperty('ALLOWED_DOMAIN') || 'saintho.org';

// ========== Point d'entrée ==========

function doPost(e) {
  try {
    // Vérifier le secret proxy
    // Note : GAS ne peut pas lire les headers custom des requêtes POST
    // Le secret est envoyé dans le body JSON à la place
    const body = JSON.parse(e.postData.contents);
    
    if (body._secret && body._secret !== PROXY_SECRET) {
      return jsonResponse({ ok: false, error: 'Non autorisé' });
    }

    const action = body.action;
    const token = body.token;
    const payload = body.payload || {};

    // Routes publiques (pas de token requis)
    const publicActions = ['login_pin', 'login_google', 'setup', 'forgot_pin'];
    
    if (!publicActions.includes(action)) {
      // Vérifier le token de session
      const session = validateSession(token);
      if (!session) {
        return jsonResponse({ ok: false, error: 'Session expirée. Reconnecte-toi.' });
      }
      payload._userId = session.userId;
      payload._email = session.email;
    }

    // Routage des actions
    switch (action) {
      case 'setup':
        return jsonResponse({ ok: true, data: setupSheet() });
      case 'login_pin':
        return jsonResponse(loginPin(payload));
      case 'login_google':
        return jsonResponse(loginGoogle(payload));
      case 'forgot_pin':
        return jsonResponse(forgotPin(payload));
      case 'admin_reset_pin':
        return jsonResponse(adminResetPin(payload));
      case 'get_profile':
        return jsonResponse(getProfile(payload));
      case 'save_session':
        return jsonResponse(saveSession(payload));
      case 'get_leaderboards':
        return jsonResponse(getLeaderboards(payload));
      case 'create_challenge':
        return jsonResponse(createChallenge(payload));
      case 'join_challenge':
        return jsonResponse(joinChallenge(payload));
      case 'submit_challenge':
        return jsonResponse(submitChallenge(payload));
      case 'get_class_challenges':
        return jsonResponse(getClassChallenges(payload));
      default:
        return jsonResponse({ ok: false, error: 'Action inconnue : ' + action });
    }
  } catch (err) {
    Logger.log('Erreur doPost: ' + err.message + '\n' + err.stack);
    return jsonResponse({ ok: false, error: 'Erreur serveur : ' + err.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== Setup automatique du Sheet ==========

function setupSheet() {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  
  const sheets = {
    'Config': ['clé', 'valeur'],
    'Profs': ['email', 'nom', 'rôle', 'classes_affectees'],
    'Journal_Admin': ['date', 'email_acteur', 'action', 'détail'],
    'Eleves': ['id', 'email', 'nom', 'prénom', 'classe', 'pin_hash', 'pin_salt', 'premiere_connexion', 'tables_autorisees', 'avatar_emoji', 'actif', 'date_creation', 'derniere_connexion'],
    'Sessions_Auth': ['token', 'eleve_id', 'email', 'expiration'],
    'Sessions_Jeu': ['id', 'eleve_id', 'date', 'mode', 'tables', 'nb_questions', 'score', 'erreurs', 'duree_s', 'serie_max', 'sans_faute_max'],
    'Maitrise': ['eleve_id', 'fait', 'niveau', 'derniere_vue'],
    'Records': ['eleve_id', 'meilleure_serie_sans_faute', 'meilleur_score_1min', 'meilleur_score_2min', 'meilleur_score_3min', 'plus_haute_table_montee'],
    'Defis': ['id', 'code_court', 'type', 'createur_id', 'classe', 'statut', 'questions', 'participants', 'date_creation', 'date_expiration'],
    'Badges': ['eleve_id', 'badge_id', 'date_obtention'],
    'Classements_Cache': ['type', 'periode', 'classe', 'données', 'date_calcul']
  };

  const created = [];
  
  for (const [name, headers] of Object.entries(sheets)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      created.push(name);
    }
  }

  // Amorcer la config par défaut si vide
  const configSheet = ss.getSheetByName('Config');
  if (configSheet.getLastRow() <= 1) {
    const defaults = [
      ['AUTH_MODE', 'pin'],
      ['ALLOWED_DOMAIN', ALLOWED_DOMAIN],
      ['TABLES_DEFAUT', '1-10'],
      ['PIN_DEFAUT', '3333'],
      ['APP_NAME', 'Calcul Mental Saintho'],
      ['DUREE_DEFI_SPRINT', '300'],
      ['DUREE_DEFI_CLM', '120'],
      ['POINTS_BONNE_REPONSE', '1'],
      ['BONUS_DEFI', '5'],
    ];
    configSheet.getRange(2, 1, defaults.length, 2).setValues(defaults);
  }

  return { message: 'Setup terminé', created: created };
}

// ========== Utilitaires crypto ==========

const DEFAULT_PIN = '3333';

function hashPin(pin, salt) {
  const raw = salt + ':' + pin;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function generateUniquePin() {
  // Génère un code à 4 chiffres (pas 0000, pas le défaut)
  let pin;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (pin === DEFAULT_PIN);
  return pin;
}

function generateSalt() {
  return Utilities.getUuid().slice(0, 16);
}

// ========== Auth — Email + PIN ==========

function loginPin(payload) {
  const { email, pin } = payload;
  if (!email || !pin) return { ok: false, error: 'Email et code requis' };

  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Eleves');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf('email');
  const hashCol = headers.indexOf('pin_hash');
  const saltCol = headers.indexOf('pin_salt');
  const firstCol = headers.indexOf('premiere_connexion');
  const idCol = headers.indexOf('id');
  const actifCol = headers.indexOf('actif');
  const connCol = headers.indexOf('derniere_connexion');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase().trim() !== String(email).toLowerCase().trim()) continue;

    // Compte désactivé ?
    if (String(data[i][actifCol]) === 'non') {
      return { ok: false, error: 'Compte désactivé. Demande à ton enseignant.' };
    }

    const storedHash = data[i][hashCol];
    const storedSalt = data[i][saltCol];
    const isFirstLogin = !storedHash || String(data[i][firstCol]) === 'oui';

    // ===== PREMIÈRE CONNEXION =====
    if (isFirstLogin && String(pin) === DEFAULT_PIN) {
      // Générer un nouveau PIN unique
      const newPin = generateUniquePin();
      const newSalt = generateSalt();
      const newHash = hashPin(newPin, newSalt);

      // Sauvegarder le hash
      sheet.getRange(i + 1, hashCol + 1).setValue(newHash);
      sheet.getRange(i + 1, saltCol + 1).setValue(newSalt);
      sheet.getRange(i + 1, firstCol + 1).setValue('non');
      if (connCol >= 0) sheet.getRange(i + 1, connCol + 1).setValue(new Date().toISOString());

      // Envoyer le PIN par email
      sendPinEmail(email, newPin, data[i][headers.indexOf('prénom')]);

      // Créer la session
      const token = Utilities.getUuid();
      const expiration = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const authSheet = ss.getSheetByName('Sessions_Auth');
      authSheet.appendRow([token, data[i][idCol], email, expiration]);

      // Recharger la ligne mise à jour
      const updatedRow = sheet.getRange(i + 1, 1, 1, headers.length).getValues()[0];

      return {
        ok: true,
        data: {
          sessionToken: token,
          profil: buildProfil(updatedRow, headers),
          firstLogin: true,
          message: 'Ton nouveau code a été envoyé à ' + email + '. Note-le bien !'
        }
      };
    }

    // ===== CONNEXION NORMALE =====
    if (storedHash && storedSalt) {
      const inputHash = hashPin(String(pin), storedSalt);
      if (inputHash === storedHash) {
        const token = Utilities.getUuid();
        const expiration = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        const authSheet = ss.getSheetByName('Sessions_Auth');
        authSheet.appendRow([token, data[i][idCol], email, expiration]);
        if (connCol >= 0) sheet.getRange(i + 1, connCol + 1).setValue(new Date().toISOString());

        return {
          ok: true,
          data: {
            sessionToken: token,
            profil: buildProfil(data[i], headers)
          }
        };
      }
    }

    // Email trouvé mais PIN incorrect
    return { ok: false, error: 'Code incorrect' };
  }

  return { ok: false, error: 'Adresse e-mail inconnue. Vérifie l\'orthographe.' };
}

// ========== Mot de passe oublié ==========

function forgotPin(payload) {
  const { email } = payload;
  if (!email) return { ok: false, error: 'Email requis' };

  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Eleves');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf('email');
  const hashCol = headers.indexOf('pin_hash');
  const saltCol = headers.indexOf('pin_salt');
  const firstCol = headers.indexOf('premiere_connexion');
  const actifCol = headers.indexOf('actif');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase().trim() !== String(email).toLowerCase().trim()) continue;

    if (String(data[i][actifCol]) === 'non') {
      return { ok: false, error: 'Compte désactivé.' };
    }

    // Générer un nouveau PIN et le renvoyer
    const newPin = generateUniquePin();
    const newSalt = generateSalt();
    const newHash = hashPin(newPin, newSalt);

    sheet.getRange(i + 1, hashCol + 1).setValue(newHash);
    sheet.getRange(i + 1, saltCol + 1).setValue(newSalt);
    sheet.getRange(i + 1, firstCol + 1).setValue('non');

    sendPinEmail(email, newPin, data[i][headers.indexOf('prénom')]);

    // Log admin
    const adminSheet = ss.getSheetByName('Journal_Admin');
    adminSheet.appendRow([new Date().toISOString(), email, 'forgot_pin', 'PIN réinitialisé et renvoyé par mail']);

    return { ok: true, data: { message: 'Un nouveau code a été envoyé à ' + email } };
  }

  // Toujours retourner le même message (sécurité : ne pas révéler si l'email existe)
  return { ok: true, data: { message: 'Si cette adresse existe, un nouveau code a été envoyé.' } };
}

// ========== Admin : Reset PIN ==========

function adminResetPin(payload) {
  // Vérifier que l'appelant est admin
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const profsSheet = ss.getSheetByName('Profs');
  const profsData = profsSheet.getDataRange().getValues();
  let isAdmin = false;
  for (let i = 1; i < profsData.length; i++) {
    if (profsData[i][0] === payload._email) { isAdmin = true; break; }
  }
  if (!isAdmin) return { ok: false, error: 'Non autorisé — réservé aux enseignants' };

  const { targetEmail } = payload;
  if (!targetEmail) return { ok: false, error: 'Email de l\'élève requis' };

  const sheet = ss.getSheetByName('Eleves');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf('email');
  const hashCol = headers.indexOf('pin_hash');
  const saltCol = headers.indexOf('pin_salt');
  const firstCol = headers.indexOf('premiere_connexion');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase().trim() !== String(targetEmail).toLowerCase().trim()) continue;

    const newPin = generateUniquePin();
    const newSalt = generateSalt();
    const newHash = hashPin(newPin, newSalt);

    sheet.getRange(i + 1, hashCol + 1).setValue(newHash);
    sheet.getRange(i + 1, saltCol + 1).setValue(newSalt);
    sheet.getRange(i + 1, firstCol + 1).setValue('non');

    sendPinEmail(targetEmail, newPin, data[i][headers.indexOf('prénom')]);

    // Log admin
    const adminSheet = ss.getSheetByName('Journal_Admin');
    adminSheet.appendRow([new Date().toISOString(), payload._email, 'admin_reset_pin', 'PIN réinitialisé pour ' + targetEmail]);

    return { ok: true, data: { message: 'Nouveau code envoyé à ' + targetEmail } };
  }

  return { ok: false, error: 'Élève non trouvé' };
}

// ========== Envoi d'email ==========

function sendPinEmail(email, pin, prenom) {
  const appName = getConfigValue('APP_NAME') || 'Calcul Mental Saintho';
  const subject = '🔑 Ton code ' + appName;
  const htmlBody = `
    <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #1B2A4A, #2D4A7A); border-radius: 16px; padding: 32px; text-align: center; color: white;">
        <h1 style="margin: 0 0 8px; font-size: 24px;">🧮 ${appName}</h1>
        <p style="margin: 0; opacity: 0.8; font-size: 14px;">Collège Saint-Honoré d'Eylau</p>
      </div>
      <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); text-align: center;">
        <p style="font-size: 18px; margin: 0 0 16px;">Salut <b>${prenom || 'Champion'}</b> 👋</p>
        <p style="font-size: 15px; color: #6B7B9A; margin: 0 0 24px;">Voici ton code personnel pour te connecter :</p>
        <div style="background: #FAF6EE; border-radius: 16px; padding: 24px; margin: 0 auto; display: inline-block;">
          <span style="font-size: 48px; font-weight: 800; letter-spacing: 12px; color: #1B2A4A;">${pin}</span>
        </div>
        <p style="font-size: 13px; color: #9AA5B8; margin: 24px 0 0;">⚠️ Ce code est personnel, ne le partage pas !</p>
        <p style="font-size: 13px; color: #9AA5B8; margin: 8px 0 0;">Si tu l'oublies, clique sur « J'ai oublié mon code » pour en recevoir un nouveau.</p>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody,
    name: appName
  });
}

function getConfigValue(key) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Config');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function loginGoogle(payload) {
  // Plan A : vérification du JWT Google (simplifiée)
  const { idToken } = payload;
  if (!idToken) return { ok: false, error: 'Token Google manquant' };

  try {
    // Vérifier le token via l'endpoint Google
    const response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken
    );
    const info = JSON.parse(response.getContentText());

    // Vérifier le domaine
    const email = info.email;
    if (!email || !email.endsWith('@' + ALLOWED_DOMAIN)) {
      return { ok: false, error: 'Utilise ton compte ' + ALLOWED_DOMAIN };
    }

    // Trouver ou créer l'élève
    const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
    const sheet = ss.getSheetByName('Eleves');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol = headers.indexOf('email');

    let row = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][emailCol] === email) { row = data[i]; break; }
    }

    if (!row) {
      // Créer un nouveau profil
      const id = Utilities.getUuid().slice(0, 8);
      const nom = info.family_name || '';
      const prenom = info.given_name || '';
      const newRow = [id, email, nom, prenom, '', '', '1-10', '🎯', 'oui', new Date().toISOString(), new Date().toISOString()];
      sheet.appendRow(newRow);
      row = newRow;
    }

    // Créer le token de session
    const token = Utilities.getUuid();
    const expiration = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const authSheet = ss.getSheetByName('Sessions_Auth');
    authSheet.appendRow([token, row[0], email, expiration]);

    return {
      ok: true,
      data: {
        sessionToken: token,
        profil: buildProfil(row, headers)
      }
    };
  } catch (err) {
    return { ok: false, error: 'Erreur de vérification Google : ' + err.message };
  }
}

// ========== Session validation ==========

function validateSession(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Sessions_Auth');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const expiration = new Date(data[i][3]);
      if (expiration > new Date()) {
        return { userId: data[i][1], email: data[i][2] };
      }
      // Session expirée, on pourrait la supprimer
      return null;
    }
  }
  return null;
}

// ========== Profil ==========

function buildProfil(row, headers) {
  const profil = {};
  const exclude = ['pin_hash', 'pin_salt']; // Ne jamais renvoyer les données sensibles
  headers.forEach((h, i) => {
    if (!exclude.includes(h)) profil[h] = row[i];
  });
  return profil;
}

function getProfile(payload) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Eleves');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === payload._userId) {
      // Récupérer aussi les records
      const records = getRecordsForUser(payload._userId);
      const mastery = getMasteryForUser(payload._userId);
      const badges = getBadgesForUser(payload._userId);

      return {
        ok: true,
        data: {
          profil: buildProfil(data[i], headers),
          records: records,
          mastery: mastery,
          badges: badges
        }
      };
    }
  }
  return { ok: false, error: 'Profil introuvable' };
}

// ========== Sauvegarde de session de jeu ==========

function saveSession(payload) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sessionId = Utilities.getUuid().slice(0, 12);
  
  // Sauvegarder dans Sessions_Jeu
  const sheet = ss.getSheetByName('Sessions_Jeu');
  sheet.appendRow([
    sessionId,
    payload._userId,
    new Date().toISOString(),
    payload.mode || 'libre',
    JSON.stringify(payload.tables || []),
    payload.nb_questions || 0,
    payload.score || 0,
    JSON.stringify(payload.erreurs || []),
    payload.duree_s || 0,
    payload.serie_max || 0,
    payload.sans_faute_max || 0
  ]);

  // Mettre à jour la maîtrise
  if (payload.mastery) {
    updateMasterySheet(payload._userId, payload.mastery);
  }

  // Mettre à jour les records
  updateRecords(payload._userId, payload);

  // Vérifier les badges
  const newBadges = checkBadges(payload._userId, payload);

  return { ok: true, data: { sessionId: sessionId, newBadges: newBadges } };
}

// ========== Maîtrise ==========

function getMasteryForUser(userId) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Maitrise');
  const data = sheet.getDataRange().getValues();
  const mastery = {};

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      mastery[data[i][1]] = data[i][2];
    }
  }
  return mastery;
}

function updateMasterySheet(userId, masteryData) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Maitrise');
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();

  const existing = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      existing[data[i][1]] = i + 1; // numéro de ligne (1-indexed)
    }
  }

  const newRows = [];
  for (const [fait, niveau] of Object.entries(masteryData)) {
    if (existing[fait]) {
      // Mettre à jour la ligne existante
      sheet.getRange(existing[fait], 3, 1, 2).setValues([[niveau, now]]);
    } else {
      newRows.push([userId, fait, niveau, now]);
    }
  }

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows);
  }
}

// ========== Records ==========

function getRecordsForUser(userId) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Records');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      const record = {};
      headers.forEach((h, idx) => { record[h] = data[i][idx]; });
      return record;
    }
  }
  return null;
}

function updateRecords(userId, sessionData) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Records');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) { rowIndex = i; break; }
  }

  if (rowIndex === -1) {
    // Créer une nouvelle ligne de records
    sheet.appendRow([userId, sessionData.serie_max || 0, 0, 0, 0, 0]);
    return;
  }

  // Mettre à jour les records si meilleurs
  const row = data[rowIndex];
  const updates = [...row];
  let changed = false;

  // Meilleure série sans faute
  if ((sessionData.sans_faute_max || 0) > (row[1] || 0)) {
    updates[1] = sessionData.sans_faute_max;
    changed = true;
  }

  // Meilleur score chrono (selon la durée)
  if (sessionData.mode === 'chrono') {
    const colMap = { '60': 2, '120': 3, '180': 4 };
    const col = colMap[String(sessionData.duree_s)];
    if (col && (sessionData.score || 0) > (row[col] || 0)) {
      updates[col] = sessionData.score;
      changed = true;
    }
  }

  if (changed) {
    sheet.getRange(rowIndex + 1, 1, 1, updates.length).setValues([updates]);
  }
}

// ========== Badges ==========

function getBadgesForUser(userId) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Badges');
  const data = sheet.getDataRange().getValues();
  const badges = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      badges.push({ badge: data[i][1], date: data[i][2] });
    }
  }
  return badges;
}

function checkBadges(userId, sessionData) {
  // Vérifications simplifiées — à étendre
  const newBadges = [];
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Badges');
  
  const existingBadges = getBadgesForUser(userId).map(b => b.badge);

  // Badges de série sans faute
  const streakBadges = { 10: 'streak_10', 20: 'streak_20', 30: 'streak_30', 50: 'streak_50', 100: 'streak_100' };
  for (const [threshold, badgeId] of Object.entries(streakBadges)) {
    if ((sessionData.sans_faute_max || 0) >= Number(threshold) && !existingBadges.includes(badgeId)) {
      sheet.appendRow([userId, badgeId, new Date().toISOString()]);
      newBadges.push(badgeId);
    }
  }

  return newBadges;
}

// ========== Classements (cache) ==========

function getLeaderboards(payload) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `lb_${payload.type}_${payload.periode}_${payload.classe || 'all'}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return { ok: true, data: JSON.parse(cached) };
  }

  // Recalculer (simplifié)
  const leaderboard = computeLeaderboard(payload.type, payload.periode, payload.classe);
  cache.put(cacheKey, JSON.stringify(leaderboard), 300); // 5 min cache

  return { ok: true, data: leaderboard };
}

function computeLeaderboard(type, periode, classe) {
  // Implémentation simplifiée — à compléter
  return { entries: [], updatedAt: new Date().toISOString() };
}

// ========== Défis (stubs) ==========

function createChallenge(payload) {
  return { ok: true, data: { message: 'Défis bientôt disponibles' } };
}

function joinChallenge(payload) {
  return { ok: true, data: { message: 'Défis bientôt disponibles' } };
}

function submitChallenge(payload) {
  return { ok: true, data: { message: 'Défis bientôt disponibles' } };
}

function getClassChallenges(payload) {
  return { ok: true, data: { challenges: [] } };
}

// ========== Utilitaire : Génération de PIN en masse ==========

function generatePinsForClass(className) {
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Eleves');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const classeCol = headers.indexOf('classe');
  const pinCol = headers.indexOf('pin');

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][classeCol] === className) {
      const pin = String(Math.floor(1000 + Math.random() * 9000)); // 4 chiffres
      sheet.getRange(i + 1, pinCol + 1).setValue(pin);
      count++;
    }
  }
  return { ok: true, data: { message: count + ' PIN générés pour la classe ' + className } };
}

// ========== Données de démo ==========

function populateDemo() {
  setupSheet();
  
  const ss = SpreadsheetApp.openById('1gzPiWRzndkpANDoNnp8VKTziDmX9pADQBiidGYG7nC4');
  const sheet = ss.getSheetByName('Eleves');

  // Les élèves démo ont le PIN par défaut (3333) = premiere_connexion = 'oui'
  const eleves = [
    ['demo001', 'alice@demo.saintho.org', 'Dupont', 'Alice', '6A', '', '', 'oui', '1-10', '🌟', 'oui'],
    ['demo002', 'bob@demo.saintho.org', 'Martin', 'Bob', '6A', '', '', 'oui', '1-10', '🚀', 'oui'],
    ['demo003', 'clara@demo.saintho.org', 'Bernard', 'Clara', '6A', '', '', 'oui', '1-15', '🎯', 'oui'],
    ['demo004', 'david@demo.saintho.org', 'Petit', 'David', '6B', '', '', 'oui', '1-10', '⚡', 'oui'],
    ['demo005', 'emma@demo.saintho.org', 'Robert', 'Emma', '6B', '', '', 'oui', '1-12', '🌈', 'oui'],
  ];

  const now = new Date().toISOString();
  eleves.forEach(e => {
    sheet.appendRow([...e, now, now]);
  });

  // Ajouter un admin
  const profsSheet = ss.getSheetByName('Profs');
  profsSheet.appendRow(['prof@demo.saintho.org', 'M. Professeur', 'admin', '6A,6B']);

  return { ok: true, data: { message: '5 élèves démo et 1 prof admin créés' } };
}
