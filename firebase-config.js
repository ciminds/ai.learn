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
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── Your Firebase project config ────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDF66Rnc-y_VJ5OM3FWG-wg4TWQibEc_9M",
  authDomain:        "ciminds.firebaseapp.com",
  projectId:         "ciminds",
  storageBucket:     "ciminds.firebasestorage.app",
  messagingSenderId: "630925853512",
  appId:             "1:630925853512:web:808ec2cdbeb8720c29297d",
  measurementId:     "G-8BLH44L897"
};

// ── Initialise ───────────────────────────────────────────────────────────────
const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth      = getAuth(app);
const db        = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ── Auth helpers ─────────────────────────────────────────────────────────────

/** Sign in with Google popup */
async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
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
    await setDoc(doc(db, "users", uid), {
      progress:    progressData,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Cloud save failed:", err.message);
  }
}

/** Load course progress state, returns null if nothing saved yet */
async function loadProgressFromCloud(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && snap.data().progress) {
      return snap.data().progress;
    }
    return null;
  } catch (err) {
    console.warn("Cloud load failed:", err.message);
    return null;
  }
}

// ── Friendly error messages ──────────────────────────────────────────────────
function getFriendlyError(code) {
  // Log the real code to console so it's easy to debug
  if (code) console.warn('[CI Minds Auth] Firebase error code:', code);

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

export {
  auth,
  db,
  googleProvider,
  signInWithGoogle,
  signInEmail,
  signUpEmail,
  updateDisplayName,
  firebaseSignOut,
  sendPasswordReset,
  onAuthChange,
  saveUserProfile,
  saveProgressToCloud,
  loadProgressFromCloud,
  getFriendlyError
};
