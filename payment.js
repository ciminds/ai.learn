// CBK Innovative Minds — Payment & Session Module (ESM)
// © CBK Innovative Minds. All rights reserved.
// This file handles: auth redirect, splash hide, enrollment check,
// Razorpay payment, session enforcement, content protection.

import {
    onAuthChange,
    firebaseSignOut,
    saveProgressToCloud,
    loadProgressFromCloud,
    db
} from './firebase-config.js';

import {
    doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── ▼▼▼ YOUR CONFIG ▼▼▼ ─────────────────────────────────────────────
const RAZORPAY_KEY_ID    = 'rzp_live_SzlEkFAoB2j5nA';
const VERIFY_PAYMENT_URL = 'REPLACE_WITH_YOUR_CLOUD_FUNCTION_URL';
// ── ▲▲▲ ─────────────────────────────────────────────────────────────

const COURSE_AMOUNT = 49900; // ₹499
const COURSE_NAME   = 'AI Fast-Track — CBK Innovative Minds (Founding Member)';
let _currentUser = null;

// ── Session enforcement ───────────────────────────────────────────────
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
        await setDoc(userRef, {
            activeSession: mySessionId,
            activeSessionAt: serverTimestamp(),
            activeSessionDevice: navigator.userAgent.slice(0, 120)
        }, { merge: true });
    } catch (err) { return; }

    if (_sessionUnsubscribe) _sessionUnsubscribe();
    _sessionUnsubscribe = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        const remoteSession = snap.data().activeSession;
        if (remoteSession && remoteSession !== mySessionId) {
            handleForcedSignOut();
        }
    });
}

async function handleForcedSignOut() {
    if (_sessionUnsubscribe) { _sessionUnsubscribe(); _sessionUnsubscribe = null; }
    sessionStorage.removeItem('ci_session_id');
    sessionStorage.removeItem('ci_uid');
    const overlay = document.createElement('div');
    overlay.id = 'forced-signout-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(17,24,39,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.25s ease;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:20px;padding:36px 32px;max-width:380px;width:100%;text-align:center;font-family:Arial,Helvetica,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.3);transform:translateY(16px) scale(0.97);transition:transform 0.3s cubic-bezier(.22,.68,0,1.05);">
            <div style="width:56px;height:56px;border-radius:50%;background:#fdf2f8;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;">
                <svg width="26" height="26" fill="none" stroke="#de00a5" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <h2 style="font-size:18px;font-weight:800;color:#111827;margin:0 0 8px;">You've been signed out</h2>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.55;">Your account was just signed in on another device. Only one device can be active at a time.</p>
            <button id="forced-signout-btn" style="background:#de00a5;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:12px;border:none;cursor:pointer;width:100%;">Go to Sign In</button>
            <p style="font-size:12px;color:#9ca3af;margin:14px 0 0;">Redirecting in <span id="forced-signout-countdown">5</span>s&hellip;</p>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.firstElementChild.style.transform = 'translateY(0) scale(1)';
    });
    const goToLogin = async () => { await firebaseSignOut(); window.location.href = 'course.html'; };
    document.getElementById('forced-signout-btn').onclick = goToLogin;
    let secondsLeft = 5;
    const countdownEl = document.getElementById('forced-signout-countdown');
    const interval = setInterval(() => {
        secondsLeft--;
        if (countdownEl) countdownEl.textContent = secondsLeft;
        if (secondsLeft <= 0) { clearInterval(interval); goToLogin(); }
    }, 1000);
}

// ── Payment helpers ───────────────────────────────────────────────────
async function verifyPaymentWithServer(paymentData) {
    try {
        const idToken = await _currentUser.getIdToken(true);
        if (!VERIFY_PAYMENT_URL || VERIFY_PAYMENT_URL.startsWith('REPLACE')) {
            console.error('[CBK] VERIFY_PAYMENT_URL not configured.');
            return false;
        }
        const response = await fetch(VERIFY_PAYMENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_payment_id: paymentData.razorpay_payment_id,
                razorpay_order_id:   paymentData.razorpay_order_id   || '',
                razorpay_signature:  paymentData.razorpay_signature  || '',
                uid: _currentUser.uid, idToken
            })
        });
        const result = await response.json();
        return response.ok && result.success === true;
    } catch { return false; }
}

function resetEnrollBtn() {
    const btn = document.getElementById('enroll-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> Enroll Now — ₹499`;
}

window.initiatePayment = function() {
    if (!_currentUser) { showToast('Please sign in before enrolling.', 'info'); return; }
    if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.endsWith('_') || RAZORPAY_KEY_ID === 'rzp_live_') {
        showToast('Payment gateway not configured. Contact support@ciminds.in', 'error'); return;
    }
    if (typeof Razorpay === 'undefined') { showToast('Payment gateway failed to load. Check your connection.', 'error'); return; }

    const btn = document.getElementById('enroll-btn');
    if (btn) { btn.textContent = 'Opening checkout…'; btn.disabled = true; }

    const options = {
        key: RAZORPAY_KEY_ID, amount: COURSE_AMOUNT, currency: 'INR',
        name: 'CI Minds', description: COURSE_NAME,
        image: 'https://ui-avatars.com/api/?name=CI&background=111827&color=fff&size=80&bold=true',
        prefill: { name: _currentUser.displayName || '', email: _currentUser.email || '' },
        notes: { uid: _currentUser.uid },
        theme: { color: '#111827' },
        modal: { ondismiss: () => resetEnrollBtn() },
        handler: async function(response) {
            if (!response.razorpay_payment_id) {
                showToast('Payment could not be verified. Contact support@ciminds.in', 'error');
                resetEnrollBtn(); return;
            }
            if (btn) btn.textContent = 'Verifying payment…';
            window.state.enrolled = true;
            window.state.paymentId = response.razorpay_payment_id;
            try {
                const key = 'cbkCourseState_' + _currentUser.uid;
                const cur = JSON.parse(localStorage.getItem(key) || '{}');
                cur.enrolled = true; cur.paymentId = response.razorpay_payment_id;
                localStorage.setItem(key, JSON.stringify(cur));
            } catch(_) {}
            showToast('🎉 Payment successful! Unlocking your course…', 'success');
            renderSidebar();
            setTimeout(() => navigate('dashboard', null, true), 700);
            const verified = await verifyPaymentWithServer(response);
            if (!verified) {
                setTimeout(async () => {
                    const retry = await verifyPaymentWithServer(response);
                    if (!retry) showToast('Payment recorded. Payment ID: ' + response.razorpay_payment_id, 'info');
                }, 5000);
            }
        }
    };

    try {
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', (resp) => {
            showToast('Payment failed: ' + (resp.error.description || 'Please try again.'), 'error');
            resetEnrollBtn();
        });
        rzp.open();
    } catch { showToast('Could not open payment window. Try refreshing.', 'error'); resetEnrollBtn(); }
};

// ── SINGLE onAuthChange — the only one for the whole dashboard ────────
onAuthChange(async (user) => {

    // 1. No user → redirect immediately, splash stays visible
    if (!user) {
        window.location.href = 'course.html';
        return;
    }

    // 2. Store UID for instant guard on next load
    sessionStorage.setItem('ci_uid', user.uid);
    localStorage.setItem('ci_last_uid', user.uid);

    // 3. Set current user for payment module
    _currentUser = user;

    // 4. Migrate generic localStorage key to per-user key
    try {
        const genericKey = 'cbkCourseState';
        const userKey = 'cbkCourseState_' + user.uid;
        const generic = localStorage.getItem(genericKey);
        const existing = localStorage.getItem(userKey);
        if (generic && !existing) { localStorage.setItem(userKey, generic); localStorage.removeItem(genericKey); }
    } catch(_) {}

    // 5. Reload window.state if different user logged in
    const _previousUid = localStorage.getItem('ci_last_uid');
    if (_previousUid && _previousUid !== user.uid) {
        try {
            const userKey = 'cbkCourseState_' + user.uid;
            const saved = localStorage.getItem(userKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                window.state = { ...window.state, ...parsed, expandedModules: parsed.expandedModules || ['m1'] };
            } else {
                window.state = { view: 'overview', activeLesson: null, progress: {}, quizScores: {}, expandedModules: ['m1'], enrolled: false, enrolledAt: null, paymentId: null, isFinished: false };
            }
            renderSidebar();
            navigate(window.state.view, window.state.activeLesson, false);
        } catch(_) {}
    }

    // 6. Enrollment check
    window._recheckEnrollment = () => checkEnrollmentStatus(user, true);
    if (window.state.enrolled === true) {
        checkEnrollmentStatus(user);
    } else {
        await checkEnrollmentStatus(user);
    }

    // 7. NOW safe to hide splash — auth confirmed
    if (typeof window._cbkHideSplash === 'function') window._cbkHideSplash();

    // 8. Session enforcement
    enforceSingleSession(user);

    // 9. Update UI with real user data
    const displayName = user.displayName || user.email.split('@')[0];
    const firstName   = displayName.split(' ')[0];
    const avatarUrl   = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111827&color=fff&rounded=true&size=128`;
    const avatarUrlSm = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111827&color=fff&rounded=true&size=64`;

    window._currentDisplayName = displayName;
    window._currentAvatarUrl   = avatarUrl;
    window._currentUserEmail   = user.email;

    const dropdownName = document.getElementById('dropdown-username');
    if (dropdownName) dropdownName.textContent = displayName.toUpperCase();
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.src = avatarUrlSm;
    const bannerAvatar = document.getElementById('profile-banner-avatar');
    if (bannerAvatar) bannerAvatar.src = avatarUrl;
    const bannerName = document.getElementById('profile-banner-name');
    if (bannerName) bannerName.textContent = displayName.toUpperCase();
    const refInput = document.getElementById('referral-link-input');
    if (refInput) refInput.value = `https://ciminds.in/ref/${(firstName + user.uid.slice(-2)).toUpperCase()}`;

    if (window.state.view === 'profile' || window.state.view === 'dashboard') navigate(window.state.view, window.state.activeLesson, false);

    // 10. Inject sign out button
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu && !document.getElementById('signout-btn')) {
        const sep = document.createElement('div'); sep.className = 'border-t border-cbk my-1';
        profileMenu.appendChild(sep);
        const btn = document.createElement('button');
        btn.id = 'signout-btn';
        btn.className = 'w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors font-medium';
        btn.textContent = 'Sign Out';
        btn.onclick = async () => { if (window._firebaseSignOut) await window._firebaseSignOut(); window.location.href = 'course.html'; };
        profileMenu.appendChild(btn);
    }

    // 11. Watermark + content protection
    const wm = document.getElementById('ci-watermark');
    if (wm) wm.textContent = `${user.email || displayName} · CI Minds`;
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.protected-content')) { e.preventDefault(); showToast('Right-click is disabled on lesson content.', 'info'); }
    });
    document.addEventListener('copy', (e) => {
        if (e.target.closest && e.target.closest('.protected-content')) e.preventDefault();
    });

    // 12. Wire cloud helpers
    window._cloudSave = (stateData) => saveProgressToCloud(user.uid, stateData).catch(() => {});
    window._cloudReset = () => saveProgressToCloud(user.uid, { view: 'overview', activeLesson: null, progress: {}, quizScores: {}, expandedModules: ['m1'] }).catch(() => {});
    window._firebaseSignOut = async () => { sessionStorage.removeItem('ci_uid'); await firebaseSignOut(); };

    // 13. Sync cloud progress
    try {
        const cloudData = await loadProgressFromCloud(user.uid);
        if (cloudData && cloudData.progress) {
            const localCount = Object.keys(window.state.progress || {}).length;
            const cloudCount = Object.keys(cloudData.progress).length;
            if (cloudCount > localCount) {
                const wasEnrolled = window.state.enrolled;
                window.state = { ...window.state, ...cloudData, expandedModules: cloudData.expandedModules || ['m1'] };
                if (wasEnrolled) window.state.enrolled = true;
                const _urlForced = sessionStorage.getItem('_forceOverview');
                if (!_urlForced && Object.keys(window.state.progress).length > 0 && window.state.view === 'overview') window.state.view = 'dashboard';
                renderSidebar();
                navigate(window.state.view, window.state.activeLesson, false);
                updateNavProgress();
            }
        }
    } catch (_) {}

    // 14. Final safety pass
    setTimeout(async () => {
        await checkEnrollmentStatus(user, false);
        if (window.state.enrolled && window.state.view === 'overview') {
            window.state.view = 'dashboard';
            renderSidebar();
            navigate('dashboard', null, false);
        }
    }, 250);

    // ── Enrollment check function ─────────────────────────────────────
    async function checkEnrollmentStatus(user, forceRender) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const data = userDoc.exists() ? userDoc.data() : null;
            if (data && data.enrolled === true) {
                const wasLocked = !window.state.enrolled;
                window.state.enrolled       = true;
                window.state.foundingMember = data.foundingMember || false;
                window.state.enrolledAt     = data.enrolledAt || null;
                window.state.paymentId      = data.paymentId  || null;
                try {
                    const lsKey = 'cbkCourseState_' + user.uid;
                    const existing = JSON.parse(localStorage.getItem(lsKey) || '{}');
                    existing.enrolled = true; existing.paymentId = window.state.paymentId;
                    localStorage.setItem(lsKey, JSON.stringify(existing));
                } catch(_) {}
                if (wasLocked || forceRender) {
                    renderSidebar();
                    navigate(window.state.view === 'overview' ? 'dashboard' : window.state.view, window.state.activeLesson, false);
                    if (forceRender) showToast('🎉 Access restored! Welcome back.', 'success');
                }
            } else if (window.state.enrolled === true) {
                try {
                    await setDoc(doc(db, 'users', user.uid), {
                        enrolled: true, foundingMember: true,
                        enrolledAt: window.state.enrolledAt || serverTimestamp(),
                        paymentId: window.state.paymentId || 'manual-resync-' + Date.now()
                    }, { merge: true });
                    if (forceRender) showToast('🎉 Access restored!', 'success');
                } catch {
                    if (forceRender) showToast('Could not verify purchase. Please contact support.', 'error');
                }
            } else {
                if (forceRender) showToast('No purchase found. If you paid, contact support.', 'info');
            }
        } catch {
            if (forceRender) showToast('Could not connect. Check your internet.', 'error');
        }
    }
});
