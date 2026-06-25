/**
 * CI MINDS — Firebase Configuration (ESM Module)
 * ─────────────────────────────────────────────────────────────
 * Uses Firebase v12 ESM imports — no compat layer needed.
 * Both index.html and dashboard.html import from this file.
 * ─────────────────────────────────────────────────────────────
 */

import { initializeApp }            from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAnalytics }             from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app-check.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── Your Firebase project config ────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBc0jyrxlCdA1mkDNN0u-VheCkGtskuaBw",
  authDomain:        "ciminds.firebaseapp.com",
  projectId:         "ciminds",
  storageBucket:     "ciminds.firebasestorage.app",
  messagingSenderId: "630925853512",
  appId:             "1:630925853512:web:808ec2cdbeb8720c29297d",
  measurementId:     "G-8BLH44L897"
};

// ── Initialise ───────────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);

// ── App Check (DDoS / bot protection) ────────────────────────────────────────
// Ties every Firestore + Auth request to a valid reCAPTCHA v3 token.
// Bots hitting Firebase directly — without going through this page —
// get a 403 from Google's infrastructure. Free, invisible to real users.
let appCheck = null;
try {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Lcu8jEtAAAAAFkM1CANjfPHRt20O38Tm7TlO2K_'),
    isTokenAutoRefreshEnabled: true
  });
  /* [log removed in production] */
} catch (err) {
  console.warn('[CI Minds] App Check failed to initialise:', err.message);
}
// ─────────────────────────────────────────────────────────────────────────────

// Analytics is wrapped in its own try/catch on purpose: ad blockers and
// privacy extensions commonly block Google Analytics' endpoints, which
// makes getAnalytics() throw. Since this file is one JS module, an
// uncaught error here would stop everything below it from running too —
// including auth and Firestore, which sign-in depends on. Auth must never
// be allowed to fail just because Analytics couldn't load.
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (err) {
  console.warn("[CI Minds] Analytics failed to initialise (likely blocked by an ad/privacy blocker) — continuing without it:", err.message);
}

const auth      = getAuth(app);

// Firestore's default transport is a long-lived streaming connection
// (WebChannel). Some networks, corporate firewalls, and privacy/ad-blocking
// tools silently swallow that kind of connection without throwing any
// error — it just hangs forever, which is exactly the "stuck checking your
// account" symptom this is fixing. experimentalAutoDetectLongPolling makes
// Firestore detect that case and fall back to plain HTTP long-polling,
// which behaves like a normal web request and survives restrictive
// networks far more reliably.
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ── Auth helpers ─────────────────────────────────────────────────────────────

/** Sign in with Google popup */
async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/** Sign in with Google via full-page redirect instead of a popup.
 *  signInWithPopup is known to hang indefinitely on some browsers — the
 *  popup completes and closes, but its result never makes it back to the
 *  page that opened it (a Cross-Origin-Opener-Policy / postMessage issue),
 *  leaving the sign-in promise stuck forever with no error to catch.
 *  Redirect-based sign-in avoids that entirely: the whole page navigates
 *  to Google and back, so there's no cross-window message that can be
 *  silently lost. Pairs with getGoogleRedirectResult() below, which must
 *  be called once on page load to pick up the result after the redirect
 *  back. This does not return a promise that resolves with the user —
 *  call getGoogleRedirectResult() after the page reloads instead. */
function signInWithGoogleRedirect() {
  return signInWithRedirect(auth, googleProvider);
}

/** Call once on page load to pick up the result of a signInWithGoogleRedirect()
 *  that just completed. Resolves to the signed-in user, or null if this
 *  page load isn't the result of a redirect sign-in (e.g. a normal visit). */
async function getGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (err) {
    console.error("[CI Minds] Google redirect sign-in failed:", err.code, err.message);
    return null;
  }
}

/** Sign in with email + password */
async function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Create account with email + password */
async function signUpEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Update Firebase Auth display name */
async function updateDisplayName(user, name) {
  return updateProfile(user, { displayName: name });
}

/** Sign out */
async function firebaseSignOut() {
  return signOut(auth);
}

/** Send password reset email */
async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Listen for auth state changes */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Firestore helpers ────────────────────────────────────────────────────────

/** Save user profile (name, interest, etc.) */
async function saveUserProfile(uid, profile) {
  try {
    await setDoc(doc(db, "users", uid), {
      profile,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Profile save failed:", err.message);
  }
}

/** Save course progress state */
async function saveProgressToCloud(uid, progressData) {
  try {
    // Store course progress under its own dedicated field "courseProgress" —
    // never overwrite top-level fields like enrolled/paymentId/activeSessionId.
    await setDoc(doc(db, "users", uid), {
      courseProgress: progressData,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    /* [log removed in production] */
  } catch (err) {
    /* [log removed in production] */
  }
}

/** Load course progress state, returns null if nothing saved yet */
async function loadProgressFromCloud(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && snap.data().courseProgress) {
      const cp = snap.data().courseProgress;
      /* [log removed in production] */
      return cp;
    }
    /* [log removed in production] */
    return null;
  } catch (err) {
    /* [log removed in production] */
    return null;
  }
}

/** Check whether this user has already registered (paid the seat-reservation fee).
 *  Returns the registration data if found, or null if not registered yet. */
async function checkRegistration(uid) {
  try {
    const snap = await getDoc(doc(db, "registrations", uid));
    if (snap.exists()) return snap.data();
    return null;
  } catch (err) {
    /* [log removed in production] */
    return null;
  }
}

/** Save a completed seat registration. Kept in its own collection, fully
 *  separate from "users" (enrollment data) — registering never enrolls
 *  someone in the course; it's purely a lead-capture + seat-reservation record. */
async function saveRegistration(uid, data) {
  try {
    await setDoc(doc(db, "registrations", uid), {
      ...data,
      registeredAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    /* [log removed in production] */
    return false;
  }
}

// ── Friendly error messages ──────────────────────────────────────────────────
function getFriendlyError(code) {
  // Log the real code to console so it's easy to debug
  /* [log removed in production] */

  const map = {
    // Sign-up errors
    'auth/email-already-in-use':        'That email is already registered. Try signing in.',
    'auth/invalid-email':               'Please enter a valid email address.',
    'auth/weak-password':               'Password must be at least 8 characters.',
    'auth/operation-not-allowed':       'Email/password sign-in is not enabled. Contact support.',
    'auth/missing-email':               'Please enter your email address.',
    'auth/missing-password':            'Please enter your password.',

    // Sign-in errors
    'auth/user-not-found':              'No account found with that email. Try signing up.',
    'auth/wrong-password':              'Incorrect password. Please try again.',
    'auth/invalid-credential':          'Incorrect email or password. Please try again.',
    'auth/invalid-login-credentials':   'Incorrect email or password. Please try again.',
    'auth/user-disabled':               'This account has been disabled. Contact support.',

    // Rate / network
    'auth/too-many-requests':           'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed':      'Network error. Check your connection and try again.',
    'auth/timeout':                     'Request timed out. Check your connection.',

    // Google popup
    'auth/popup-blocked':               'Popup blocked. Allow popups for this site and try again.',
    'auth/popup-closed-by-user':        '',
    'auth/cancelled-popup-request':     '',
    'auth/unauthorized-domain':         'This domain is not authorised. Add it in Firebase Console → Authentication → Authorised Domains.',

    // Generic
    'auth/internal-error':              'An internal error occurred. Please try again.',
    'auth/requires-recent-login':       'Please sign in again to continue.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email. Try signing in with Google.',
  };
  return map[code] || (code ? `Error: ${code}` : 'Something went wrong. Please try again.');
}

/** Register this device as the active session for the user. Overwrites any previous session. */
async function registerSession(uid, sessionId) {
  try {
    await setDoc(doc(db, "users", uid), {
      activeSessionId: sessionId,
      lastDevice: navigator.userAgent,
      lastLogin: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    /* [log removed in production] */
  }
}

/** Listen for changes to the user's activeSessionId. Calls callback(activeSessionId) on every change. */
function watchSession(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) {
      callback(snap.data().activeSessionId || null);
    }
  }, (err) => {
    /* [log removed in production] */
  });
}

export {
  auth,
  db,
  appCheck,
  googleProvider,
  registerSession,
  watchSession,
  signInWithGoogle,
  signInWithGoogleRedirect,
  getGoogleRedirectResult,
  signInEmail,
  signUpEmail,
  updateDisplayName,
  firebaseSignOut,
  sendPasswordReset,
  onAuthChange,
  saveUserProfile,
  saveProgressToCloud,
  loadProgressFromCloud,
  getFriendlyError,
  checkRegistration,
  saveRegistration
};
