// ── SECURITY NOTES FOR DEPLOYMENT ──────────────────────────────────────────
// 1. Set these HTTP headers on your hosting platform (Firebase / Netlify):
//    X-Frame-Options: DENY
//    X-Content-Type-Options: nosniff
//    Referrer-Policy: strict-origin-when-cross-origin
//    Permissions-Policy: geolocation=(), microphone=(), camera=()
// 2. Razorpay key ID is intentionally client-side (Razorpay's design).
//    Restrict it in Razorpay Dashboard → Settings → API Keys → Whitelist domains.
// 3. VERIFY_PAYMENT_URL must point to your deployed Cloud Function.
//    enrolled:true is ONLY written there — never client-side.
// 4. Firebase security rules must deny direct client writes to users/{uid}.enrolled
//    Use: allow write: if false; for the enrolled field.
// ─────────────────────────────────────────────────────────────────────────────

// CBK Innovative Minds — Payment & Auth Module (ESM)
// © CBK Innovative Minds. All rights reserved.
// Requires: firebase-config.js loaded first, Razorpay SDK in HTML

import {
    onAuthChange,
    firebaseSignOut,
    saveProgressToCloud,
    loadProgressFromCloud,
    db
} from './firebase-config.js';

import {
    doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// onAuthChange fires as soon as Firebase resolves the session.
// The dashboard has ALREADY rendered from localStorage by this point
// (init() ran on DOMContentLoaded above), so we just:
//   1. redirect if no user
//   2. patch in the real user info + cloud helpers
//   3. silently sync any newer cloud progress

onAuthChange(async (user) => {

    if (!user) {
        // No user — redirect immediately, keep splash visible
        window.location.href = 'course.html';
        return;
    }

    // Auth confirmed — now safe to hide splash and show dashboard
    if (typeof window._cbkHideSplash === 'function') window._cbkHideSplash();

    // Detect if init() rendered with a DIFFERENT user's data (e.g. a
    // different account just logged in on this browser). If so,
    // reload the correct user's saved state now.
    const _previousUid = localStorage.getItem('ci_last_uid');
    const _uidMismatch = _previousUid && _previousUid !== user.uid;

    // Store UID so future saveState() calls key localStorage per-user.
    // Use BOTH: sessionStorage for fast per-tab access, localStorage so
    // the correct user-scoped key is found on the NEXT page load too
    // (sessionStorage is wiped on browser restart, localStorage isn't).
    sessionStorage.setItem('ci_uid', user.uid);
    localStorage.setItem('ci_last_uid', user.uid);

    // ── Migrate any data saved under the generic key (no uid) before
    // the first onAuthChange resolved, into the per-user key. This
    // handles the very first login on a fresh browser.
    try {
        const genericKey = 'cbkCourseState';
        const userKey = 'cbkCourseState_' + user.uid;
        const generic = localStorage.getItem(genericKey);
        const existing = localStorage.getItem(userKey);
        if (generic && !existing) {
            localStorage.setItem(userKey, generic);
            localStorage.removeItem(genericKey);
        }
    } catch(_) {}

    // ── If a different account just logged in, reload THIS user's
    // saved state from their correct key (init() may have used the
    // previous user's key, or an empty key).
    if (_uidMismatch) {
        try {
            const userKey = 'cbkCourseState_' + user.uid;
            const saved = localStorage.getItem(userKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed, expandedModules: parsed.expandedModules || ['m1'] };
            } else {
                // No saved data for this user — reset to fresh state
                state = { view: 'overview', activeLesson: null, progress: {}, quizScores: {}, expandedModules: ['m1'], enrolled: false, enrolledAt: null, paymentId: null, isFinished: false };
            }
            renderSidebar();
            navigate(state.view, state.activeLesson, false);
        } catch(_) {}
    }

    // ── ENROLLMENT CHECK ──────────────────────────────────────────────
    // Firestore's top-level `enrolled` field is authoritative, but if
    // localStorage ALREADY says enrolled:true (the common case for
    // returning users), don't block rendering on a network round-trip
    // — render immediately, verify with Firestore in the background.
    // Only NEW/unverified devices wait for the Firestore check.
    window._recheckEnrollment = () => checkEnrollmentStatus(user, true);
    if (state.enrolled === true) {
        checkEnrollmentStatus(user); // fire-and-forget background verification
    } else {
        await checkEnrollmentStatus(user); // must wait — paywall depends on this
    }

    // ── Reusable enrollment check — also callable on-demand via the
    // "Restore access" button on the locked overview page. ──────────
    async function checkEnrollmentStatus(user, forceRender) {
        // [log removed]
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const data = userDoc.exists() ? userDoc.data() : null;
            // [log removed]

            if (data && data.enrolled === true) {
                const wasLocked = !state.enrolled;
                state.enrolled   = true;
                state.enrolledAt = data.enrolledAt || null;
                state.paymentId  = data.paymentId  || null;
                try {
                    const lsKey = 'cbkCourseState_' + user.uid;
                    const existing = JSON.parse(localStorage.getItem(lsKey) || '{}');
                    existing.enrolled  = true;
                    existing.paymentId = state.paymentId;
                    localStorage.setItem(lsKey, JSON.stringify(existing));
                } catch(_) {}
                // [log removed]
                if (wasLocked || forceRender) {
                    renderSidebar();
                    navigate(state.view === 'overview' ? 'dashboard' : state.view, state.activeLesson, false);
                    if (forceRender) showToast('🎉 Access restored! Welcome back.', 'success');
                }
            } else if (state.enrolled === true) {
                // [log removed]
                try {
                    await setDoc(doc(db, 'users', user.uid), {
                        enrolled:       true,
                        foundingMember: true,
                        enrolledAt:     state.enrolledAt ? state.enrolledAt : serverTimestamp(),
                        paymentId:      state.paymentId || 'manual-resync-' + Date.now()
                    }, { merge: true });
                    // [log removed]
                    if (forceRender) showToast('🎉 Access restored!', 'success');
                } catch (e) {
                    // [log removed]
                    if (forceRender) showToast('Could not verify purchase. Please contact support.', 'error');
                }
            } else {
                // [log removed]
                if (forceRender) showToast('No purchase found for this account. If you paid, contact support.', 'info');
            }
        } catch (err) {
            // [log removed]
            if (forceRender) showToast('Could not connect. Check your internet and try again.', 'error');
        }
    }

    // Wire cloud save/reset helpers (saveState calls these if present)
    window._cloudSave = (stateData) => {
        saveProgressToCloud(user.uid, stateData).catch(() => {});
    };
    window._cloudReset = () => {
        saveProgressToCloud(user.uid, {
            view: 'overview', activeLesson: null,
            progress: {}, quizScores: {}, expandedModules: ['m1']
        }).catch(() => {});
    };
    window._firebaseSignOut = async () => {
        sessionStorage.removeItem('ci_uid');
        // NOTE: deliberately keep 'ci_last_uid' and 'cbkCourseState_{uid}'
        // in localStorage — this is the user's saved progress and must
        // persist across sign-out/sign-in so it's instantly available
        // on next login (Firestore sync will also keep it correct).
        await firebaseSignOut();
    };

    // ── Update ALL name + avatar spots with real user data ──────────────
    const displayName = user.displayName || user.email.split('@')[0];
    const firstName   = displayName.split(' ')[0];
    const initials    = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const avatarUrl   = user.photoURL ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111827&color=fff&rounded=true&size=128`;
    const avatarUrlSm = user.photoURL ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111827&color=fff&rounded=true&size=64`;

    // Store globally so buildProfile() and welcome message can read it live
    window._currentDisplayName = displayName;
    window._currentAvatarUrl   = avatarUrl;
    window._currentUserEmail   = user.email;

    // 1. Header dropdown name
    const dropdownName = document.getElementById('dropdown-username');
    if (dropdownName) dropdownName.textContent = displayName.toUpperCase();

    // 2. Header small avatar
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.src = avatarUrlSm;

    // 3. Profile banner big avatar
    const bannerAvatar = document.getElementById('profile-banner-avatar');
    if (bannerAvatar) bannerAvatar.src = avatarUrl;

    // 4. Profile banner name
    const bannerName = document.getElementById('profile-banner-name');
    if (bannerName) bannerName.textContent = displayName.toUpperCase();

    // 5. Referral link — use first name + last 2 chars of uid
    const refInput = document.getElementById('referral-link-input');
    if (refInput) {
        const handle = (firstName + user.uid.slice(-2)).toUpperCase();
        refInput.value = `https://ciminds.in/ref/${handle}`;
    }

    // 6. Re-render current view now that real name/avatar are available —
    //    fixes "Welcome back, there" / blank name flashing on load.
    if (state.view === 'profile' || state.view === 'dashboard') {
        navigate(state.view, state.activeLesson, false);
    }

    // Inject Sign Out into dropdown (only once)
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu && !document.getElementById('signout-btn')) {
        const sep = document.createElement('div');
        sep.className = 'border-t border-gray-100 my-1';
        profileMenu.appendChild(sep);
        const btn = document.createElement('button');
        btn.id = 'signout-btn';
        btn.className = 'w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors font-medium';
        btn.textContent = 'Sign Out';
        btn.onclick = async () => {
            if (window._firebaseSignOut) await window._firebaseSignOut();
            window.location.href = 'course.html';
        };
        profileMenu.appendChild(btn);
    }

    // Silently load cloud progress — only re-render if it has MORE progress
    try {
        const cloudData = await loadProgressFromCloud(user.uid);
        if (cloudData && cloudData.progress) {
            const localCount = Object.keys(state.progress || {}).length;
            const cloudCount = Object.keys(cloudData.progress).length;
            if (cloudCount > localCount) {
                const wasEnrolled = state.enrolled; // preserve local enrolled flag
                state = { ...state, ...cloudData, expandedModules: cloudData.expandedModules || ['m1'] };
                // Never downgrade enrolled status — if user paid, stay unlocked
                if (wasEnrolled) state.enrolled = true;
                // Don't auto-navigate away from overview if user explicitly came here
                const _urlForced = sessionStorage.getItem('_forceOverview');
                if (!_urlForced && Object.keys(state.progress).length > 0 && state.view === 'overview') {
                    state.view = 'dashboard';
                }
                renderSidebar();
                navigate(state.view, state.activeLesson, false);
                updateNavProgress();
            }
        }
    } catch (_) { /* cloud unavailable — localStorage render is fine */ }

    // ── FINAL SAFETY PASS ─────────────────────────────────────────────
    // After everything above has settled, do one last enrollment check
    // and force a render if the screen is STILL showing the locked
    // overview for an enrolled user. This guarantees a paying user
    // never gets stuck on the paywall, regardless of timing/ordering
    // issues in the steps above.
    setTimeout(async () => {
        await checkEnrollmentStatus(user, false);
        if (state.enrolled && state.view === 'overview') {
            // [log removed]
            state.view = 'dashboard';
            renderSidebar();
            navigate('dashboard', null, false);
        }
    }, 250);
});
</script>

<!-- ── Razorpay SDK ──────────────────────────────────────────────────── -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

<!-- ── Payment Module (ESM — imports Firebase) ───────────────────────── -->
<script type="module">
import {
    onAuthChange,
    firebaseSignOut,
    db
} from './firebase-config.js';

import {
    doc, setDoc, getDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── ▼▼▼ YOUR CONFIG ▼▼▼ ─────────────────────────────────────────────
const RAZORPAY_KEY_ID = 'rzp_live_';   // paste your full live key here
// Cloud Function URL — update after deploying functions/index.js
// Example: 'https://asia-south1-YOUR-PROJECT-ID.cloudfunctions.net/verifyPayment'
const VERIFY_PAYMENT_URL = 'REPLACE_WITH_YOUR_CLOUD_FUNCTION_URL';
// ── ▲▲▲ ─────────────────────────────────────────────────────────────

const COURSE_AMOUNT = 49900; // ₹499 founding member price (was ₹99)
const COURSE_NAME   = 'AI Fast-Track — CBK Innovative Minds (Founding Member)';
let _currentUser = null;

// ── verifyPaymentWithServer ──────────────────────────────────────────
// Sends payment IDs to the Cloud Function for server-side HMAC
// verification. enrolled:true is ONLY written by the server.
async function verifyPaymentWithServer(paymentData) {
    try {
        // Get a fresh Firebase ID token to prove identity to the server
        const idToken = await _currentUser.getIdToken(true);

        // SECURITY: Never call if URL is still a placeholder
        if (!VERIFY_PAYMENT_URL || VERIFY_PAYMENT_URL.startsWith('REPLACE')) {
            console.error('[CBK] VERIFY_PAYMENT_URL not configured. Server verification skipped.');
            return false;
        }
        const response = await fetch(VERIFY_PAYMENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_payment_id: paymentData.razorpay_payment_id,
                razorpay_order_id:   paymentData.razorpay_order_id   || '',
                razorpay_signature:  paymentData.razorpay_signature  || '',
                uid:     _currentUser.uid,
                idToken: idToken
            })
        });

        const result = await response.json();
        return response.ok && result.success === true;
    } catch (err) {
        return false;
    }
}

// ── Reset enroll button to default state ─────────────────────────────
function resetEnrollBtn() {
    const btn = document.getElementById('enroll-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> Enroll Now — ₹99`;
}

// ── initiatePayment ───────────────────────────────────────────────────
window.initiatePayment = function() {
    if (!_currentUser) { showToast('Please sign in before enrolling.', 'info'); return; }
    if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.endsWith('_') || RAZORPAY_KEY_ID === 'rzp_live_') { showToast('Payment gateway not configured. Contact support@ciminds.in', 'error'); console.error('[CBK] Razorpay key not configured'); return; }
    if (typeof Razorpay === 'undefined') { showToast('Payment gateway failed to load. Check your connection.', 'error'); return; }

    const btn = document.getElementById('enroll-btn');
    if (btn) { btn.textContent = 'Opening checkout…'; btn.disabled = true; }

    const options = {
        key:         RAZORPAY_KEY_ID,
        amount:      COURSE_AMOUNT,
        currency:    'INR',
        name:        'CI Minds',
        description: COURSE_NAME,
        image:       'https://ui-avatars.com/api/?name=CI&background=111827&color=fff&size=80&bold=true',
        prefill: {
            name:  _currentUser.displayName || '',
            email: _currentUser.email        || '',
        },
        notes: {
            uid: _currentUser.uid    // passed to Razorpay webhook for server-side use
        },
        theme: { color: '#111827' },
        modal: { ondismiss: function() { resetEnrollBtn(); } },
        handler: async function(response) {
            if (!response.razorpay_payment_id) {
                showToast('Payment could not be verified. Contact support@ciminds.in', 'error');
                resetEnrollBtn();
                return;
            }

            if (btn) { btn.textContent = 'Verifying payment…'; }

            // ── Unlock UI immediately (UX) while server verifies ──────
            // User never waits. If server verification fails, we show
            // an error and prompt them to contact support with their
            // payment ID (which they already have from Razorpay receipt).
            state.enrolled  = true;
            state.paymentId = response.razorpay_payment_id;
            try {
                const key = 'cbkCourseState_' + _currentUser.uid;
                const cur = JSON.parse(localStorage.getItem(key) || '{}');
                cur.enrolled = true; cur.paymentId = response.razorpay_payment_id;
                localStorage.setItem(key, JSON.stringify(cur));
            } catch(_) {}

            showToast('🎉 Payment successful! Unlocking your course…', 'success');
            renderSidebar();
            setTimeout(() => navigate('dashboard', null, true), 700);

            // ── Server-side verification (background) ─────────────────
            // Cloud Function verifies HMAC signature and writes
            // enrolled:true — the ONLY place this is ever written.
            const verified = await verifyPaymentWithServer(response);
            if (!verified) {
                // Server verification failed — retry once after 5s
                setTimeout(async () => {
                    const retry = await verifyPaymentWithServer(response);
                    if (!retry) {
                        showToast(
                            'Payment recorded but server sync failed. Your access is saved. ' +
                            'Payment ID: ' + response.razorpay_payment_id,
                            'info'
                        );
                    }
                }, 5000);
            }
        }
    };

    try {
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function(resp) {
            showToast('Payment failed: ' + (resp.error.description || 'Please try again.'), 'error');
            resetEnrollBtn();
        });
        rzp.open();
    } catch (err) {
        showToast('Could not open payment window. Try refreshing the page.', 'error');
        resetEnrollBtn();
    }
};

// ── Single-session enforcement ────────────────────────────────────────
// Generate or reuse a session ID for THIS browser tab/device.
// Stored in sessionStorage so each new tab/device gets a fresh ID,
// but refreshing the same tab keeps the same ID.
function getMySessionId() {
    let sid = sessionStorage.getItem('ci_session_id');
    if (!sid) {
        sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('ci_session_id', sid);
    }
    return sid;
}

let _sessionUnsubscribe = null;

async function enforceSingleSession(user) {
    const mySessionId = getMySessionId();
    const userRef = doc(db, 'users', user.uid);

    try {
        // Claim this session as the active one (last login wins)
        await setDoc(userRef, {
            activeSession: mySessionId,
            activeSessionAt: serverTimestamp(),
            activeSessionDevice: navigator.userAgent.slice(0, 120)
        }, { merge: true });
    } catch (err) {
        // [log removed]
        return; // don't enforce if we can't even write
    }

    // Listen for changes — if activeSession changes to something else,
    // this device is no longer the active one.
    if (_sessionUnsubscribe) _sessionUnsubscribe();
    _sessionUnsubscribe = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        const remoteSession = snap.data().activeSession;
        if (remoteSession && remoteSession !== mySessionId) {
            // Another device has logged in — sign this one out
            handleForcedSignOut();
        }
    });
}

async function handleForcedSignOut() {
    if (_sessionUnsubscribe) { _sessionUnsubscribe(); _sessionUnsubscribe = null; }
    sessionStorage.removeItem('ci_session_id');
    sessionStorage.removeItem('ci_uid');

    // ── Polished sign-out modal, matches site branding ────────────────
    const overlay = document.createElement('div');
    overlay.id = 'forced-signout-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(17,24,39,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.25s ease;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:20px;padding:36px 32px;max-width:380px;width:100%;text-align:center;font-family:Arial,Helvetica,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.3);transform:translateY(16px) scale(0.97);transition:transform 0.3s cubic-bezier(.22,.68,0,1.05);">
            <div style="width:56px;height:56px;border-radius:50%;background:#fdf2f8;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;">
                <svg width="26" height="26" fill="none" stroke="#de00a5" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <h2 style="font-size:18px;font-weight:800;color:#111827;margin:0 0 8px;letter-spacing:-0.01em;">You've been signed out</h2>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.55;">Your account was just signed in on another device. For your security, only one device can be active at a time.</p>
            <button id="forced-signout-btn" style="background:#de00a5;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:12px;border:none;cursor:pointer;width:100%;transition:opacity 0.15s;">Go to Sign In</button>
            <p style="font-size:12px;color:#9ca3af;margin:14px 0 0;">Redirecting automatically in <span id="forced-signout-countdown">5</span>s&hellip;</p>
        </div>
    `;
    document.body.appendChild(overlay);
    // Animate in
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.firstElementChild.style.transform = 'translateY(0) scale(1)';
    });

    const goToLogin = async () => {
        await firebaseSignOut();
        window.location.href = 'course.html';
    };
    document.getElementById('forced-signout-btn').onclick = goToLogin;
    document.getElementById('forced-signout-btn').onmouseenter = e => e.target.style.opacity = '0.9';
    document.getElementById('forced-signout-btn').onmouseleave = e => e.target.style.opacity = '1';

    // Countdown + auto-redirect
    let secondsLeft = 5;
    const countdownEl = document.getElementById('forced-signout-countdown');
    const interval = setInterval(() => {
        secondsLeft -= 1;
        if (countdownEl) countdownEl.textContent = secondsLeft;
        if (secondsLeft <= 0) {
            clearInterval(interval);
            goToLogin();
        }
    }, 1000);
}

// Re-claim session when tab regains focus (catches reopened tabs)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _currentUser) {
        // Just re-check via the existing snapshot listener — no action needed
        // unless we want to re-claim ownership on focus (optional, kept passive)
    }
});

// ── Auth change: set _currentUser, session enforcement, content protection ──
// (Enrollment checking is handled ONCE, in the main module above —
// having it here too caused a bug where this duplicate would call
// navigate('overview', ...) and send enrolled users back to the
// paywall screen right after the main module unlocked them.)
onAuthChange(async (user) => {
    if (!user) return;  // main module handles redirect to index
    _currentUser = user;

    // ── Claim this session as active, watch for takeover ─────────────
    enforceSingleSession(user);

    // ── Watermark with user's email (subtle, bottom-right) ────────────
    const wm = document.getElementById('ci-watermark');
    if (wm) wm.textContent = `${user.email || user.displayName || ''} · CI Minds`;

    // ── Disable right-click context menu on protected content ────────
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.protected-content')) {
            e.preventDefault();
            showToast('Right-click is disabled on lesson content.', 'info');
        }
    });

    // ── Disable copy on protected content ─────────────────────────────
    document.addEventListener('copy', (e) => {
        if (e.target.closest && e.target.closest('.protected-content')) {
            e.preventDefault();
        }
    });
});
</script>

<!-- ═══════════════════════════════════════════════════════
 ONBOARDING TUTORIAL — game-style step-by-step walkthrough
═══════════════════════════════════════════════════════ -->
<div id="tutorial-overlay">
<div id="tutorial-card"></div>
</div>
<svg id="tutorial-arrow" style="position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;pointer-events:none;display:none;" xmlns="http://www.w3.org/2000/svg">
<defs>
    <marker id="tut-arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
        <path d="M0,0 L8,4 L0,8 Z" fill="#1a1a1a"/>
    </marker>
</defs>
<path id="tut-arrow-path" d="" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 6" marker-end="url(#tut-arrowhead)"/>
</svg>
<button id="tutorial-help-btn" onclick="startTutorial(true)" title="Show guide" aria-label="Show guide">?</button>

<script>
// ── Onboarding guide: simple centered modal, Shopify-style ────────────
// No spotlight / DOM-measurement — works identically on every screen
// size, including mobile where the sidebar is off-canvas.
const TUTORIAL_STEPS = [
    {
        title: 'Welcome to CI Minds',
        text: "Here's a quick look at how your dashboard works — it only takes a minute. We'll show you around as you go.",
        icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>'
    },
    {
        title: 'Course content',
        text: 'All modules and lessons are listed here in the sidebar. Click any lesson to start — completed lessons are marked automatically.',
        icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>',
        // Open the mobile drawer (if on mobile) so the sidebar is visible
        action: () => { if (window.innerWidth < 768 && typeof openMobDrawer === 'function') openMobDrawer(); },
        // On mobile, point at the first item in the drawer's nav list
        // rather than the whole (viewport-spanning) container — a
        // target that large gets skipped by the arrow/pulse logic
        // (by design, to avoid drawing through the card) and leaves
        // the user with no visual anchor at all. The drawer's nav
        // buttons are generated without stable classes/ids, so target
        // structurally: the first button element inside the nav.
        target: () => window.innerWidth < 768 ? '#mob-drawer-nav button:first-child' : '#sidebar-nav'
    },
    {
        title: 'Track your progress',
        text: 'This fills up as you complete lessons, so you always know how far along you are in the course.',
        icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>',
        // Close mobile drawer + go to dashboard. Desktop shows a progress
        // bar in the header; mobile shows a compact ring in the same
        // spot (added since the full bar+label doesn't fit). Both live
        // in the persistent header, so they're visible regardless of
        // enrollment state or which view is showing.
        action: () => {
            if (window.innerWidth < 768 && typeof closeMobDrawer === 'function') closeMobDrawer();
            navigate('dashboard', null, false);
        },
        target: () => window.innerWidth < 768 ? '.mob-progress-ring' : '.nav-progress-wrap'
    },
    {
        title: 'Profile & certificate',
        text: 'Tap your avatar here to view your profile, subscriptions, and — once you finish the course — your certificate.',
        icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
        target: '#header-avatar'
    },
    {
        title: 'Reset progress',
        text: "If you want to restart a module, use Reset Progress here in the sidebar. This never affects your purchase or account access.",
        icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>',
        action: () => { if (window.innerWidth < 768 && typeof openMobDrawer === 'function') openMobDrawer(); },
        target: () => window.innerWidth < 768 ? '#mob-sidebar-reset-btn' : '#sidebar-reset-btn'
    },
    {
        title: "You're ready",
        text: "That's everything. Start with Module 1 whenever you're ready — you can replay this guide anytime from the ? button.",
        icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
        action: () => { if (window.innerWidth < 768 && typeof closeMobDrawer === 'function') closeMobDrawer(); }
    }
];

let _tutStep = 0;

function startTutorial(forceShow) {
    if (!forceShow && localStorage.getItem('ci_tutorial_seen') === '1') return;
    _tutStep = 0;
    document.getElementById('tutorial-overlay').classList.add('active');
    renderTutorialStep();
}

function endTutorial() {
    document.getElementById('tutorial-overlay').classList.remove('active');
    document.getElementById('tutorial-arrow').style.display = 'none';
    localStorage.setItem('ci_tutorial_seen', '1');
    clearTutorialPulse();
    // Restore default view if a step navigated somewhere mid-tour
    if (window.innerWidth < 768 && typeof closeMobDrawer === 'function') closeMobDrawer();
}

function nextTutorialStep() {
    _tutStep++;
    if (_tutStep >= TUTORIAL_STEPS.length) {
        endTutorial();
        return;
    }
    renderTutorialStep();
}

let _tutPulseEl = null;

function clearTutorialPulse() {
    if (_tutPulseEl) {
        _tutPulseEl.classList.remove('tut-pulse');
        _tutPulseEl = null;
    }
}

function renderTutorialStep() {
    clearTutorialPulse();
    document.getElementById('tutorial-arrow').style.display = 'none';

    const step = TUTORIAL_STEPS[_tutStep];
    const card = document.getElementById('tutorial-card');
    const isLast = _tutStep === TUTORIAL_STEPS.length - 1;
    const dots = TUTORIAL_STEPS.map((_, i) =>
        `<span class="tut-dot ${i === _tutStep ? 'active' : ''}"></span>`
    ).join('');

    // ── Take the user where this step is talking about ────────────────
    if (typeof step.action === 'function') {
        try { step.action(); } catch(_) {}
    }

    card.innerHTML = `
        <button class="tut-close" onclick="endTutorial()" aria-label="Close">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <div class="tut-icon">${step.icon}</div>
        <h3>${step.title}</h3>
        <p>${step.text}</p>
        <div class="tut-actions">
            <div class="tut-dots">${dots}</div>
            <div class="tut-btn-group">
                ${!isLast ? `<button class="tut-skip" onclick="endTutorial()">Skip</button>` : ''}
                <button class="tut-next" onclick="nextTutorialStep()">${isLast ? "Get started" : "Next"}</button>
            </div>
        </div>
    `;

    // ── Briefly highlight the real UI element + draw a pointing arrow ──
    if (step.target) {
        const selector = typeof step.target === 'function' ? step.target() : step.target;
        setTimeout(() => {
            const el = document.querySelector(selector);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('tut-pulse');
                _tutPulseEl = el;
                // Wait for scroll to settle before measuring positions
                setTimeout(() => drawTutorialArrow(el), 350);
            }
        }, 150); // small delay lets navigate()/drawer animations settle first
    }
}

// ── Draw a curved dashed arrow from the card edge to the target element ──
function drawTutorialArrow(targetEl) {
    const svg = document.getElementById('tutorial-arrow');
    const path = document.getElementById('tut-arrow-path');
    const card = document.getElementById('tutorial-card');

    const cardRect = card.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    // Skip if the target is hidden (display:none, e.g. an element
    // that's only shown at larger breakpoints) — getBoundingClientRect
    // returns an all-zero rect in that case, which would otherwise
    // draw a meaningless arrow into the top-left corner.
    if (targetRect.width === 0 && targetRect.height === 0) {
        svg.style.display = 'none';
        return;
    }

    // Skip the arrow if the target is off-screen (don't draw to nowhere)
    if (targetRect.bottom < 0 || targetRect.top > window.innerHeight ||
        targetRect.right < 0 || targetRect.left > window.innerWidth) {
        svg.style.display = 'none';
        return;
    }

    // Skip if the target overlaps/contains the card itself, or is so
    // large it spans most of the viewport — an arrow into a huge
    // region (e.g. the whole sidebar) looks broken. The pulse outline
    // alone is sufficient in these cases.
    const overlaps = !(targetRect.right < cardRect.left || targetRect.left > cardRect.right ||
                        targetRect.bottom < cardRect.top || targetRect.top > cardRect.bottom);
    const tooLarge = targetRect.width > window.innerWidth * 0.6 && targetRect.height > window.innerHeight * 0.6;
    if (overlaps || tooLarge) {
        svg.style.display = 'none';
        return;
    }

    const cardCenterX = cardRect.left + cardRect.width / 2;
    const cardCenterY = cardRect.top + cardRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    // Pick the card edge closest to the target, so the arrow starts
    // from the side of the card facing the element it points to.
    let startX, startY;
    const dx = targetCenterX - cardCenterX;
    const dy = targetCenterY - cardCenterY;

    if (Math.abs(dx) > Math.abs(dy)) {
        // Target is more left/right of card — start from card's left/right edge
        startX = dx > 0 ? cardRect.right : cardRect.left;
        startY = cardCenterY;
    } else {
        // Target is more above/below card — start from card's top/bottom edge
        startX = cardCenterX;
        startY = dy > 0 ? cardRect.bottom : cardRect.top;
    }

    // End point: the edge of the target closest to the start point,
    // with a small gap so the arrowhead doesn't overlap the element.
    const gap = 10;
    let endX, endY;
    const edx = startX - targetCenterX;
    const edy = startY - targetCenterY;
    if (Math.abs(edx) > Math.abs(edy)) {
        endX = edx > 0 ? targetRect.right + gap : targetRect.left - gap;
        endY = targetCenterY;
    } else {
        endX = targetCenterX;
        endY = edy > 0 ? targetRect.bottom + gap : targetRect.top - gap;
    }

    // Curved path via a control point offset perpendicular to the line
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const curveStrength = 0.25;
    const perpX = -(endY - startY) * curveStrength;
    const perpY = (endX - startX) * curveStrength;
    const ctrlX = midX + perpX;
    const ctrlY = midY + perpY;

    path.setAttribute('d', `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`);
    svg.style.display = 'block';
}

window.addEventListener('resize', () => {
    if (_tutPulseEl && document.getElementById('tutorial-overlay').classList.contains('active')) {
        drawTutorialArrow(_tutPulseEl);
    }
});

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        // Only show automatically to NEW users — someone who hasn't
        // completed any lessons yet. Existing students with progress
        // already know their way around and shouldn't be interrupted.
        const hasProgress = Object.keys(state.progress || {}).length > 0;
        if (hasProgress) {
            localStorage.setItem('ci_tutorial_seen', '1');
            return;
        }
        startTutorial(false);
    }, 600);
});
