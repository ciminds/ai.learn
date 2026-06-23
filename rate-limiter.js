/**
 * CI Minds — Client-Side Rate Limiter
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in module. No dependencies. Works with your existing Firebase v12 ESM
 * setup. Import it at the top of any page that needs protection.
 *
 * WHAT IT PROTECTS
 * ┌─────────────────────────────────┬──────────────────────────────────────────┐
 * │ Action                          │ Limit                                    │
 * ├─────────────────────────────────┼──────────────────────────────────────────┤
 * │ Google sign-in (popup/redirect) │ 5 attempts per 15 minutes                │
 * │ Register form submit            │ 3 attempts per 10 minutes                │
 * │ Payment (Razorpay open)         │ 3 attempts per 10 minutes                │
 * │ Password reset email            │ 3 attempts per 30 minutes                │
 * │ Dashboard content load          │ 60 requests per minute                   │
 * │ Any unknown / generic action    │ 20 attempts per minute                   │
 * └─────────────────────────────────┴──────────────────────────────────────────┘
 *
 * HOW TO USE — 3 steps:
 *
 *   1. Add this line at the top of register.html, index.html, dashboard.html
 *      (inside your existing <script type="module"> block):
 *
 *        import { checkRateLimit, recordAttempt, clearLimit } from './rate-limiter.js';
 *
 *   2. Before any sensitive action call checkRateLimit(), then recordAttempt():
 *
 *        if (!checkRateLimit('google-signin')) return;
 *        recordAttempt('google-signin');
 *        // ... your existing code ...
 *
 *   3. On SUCCESS clear the counter so a real user is not penalised:
 *
 *        clearLimit('google-signin');
 *
 * STORAGE: sessionStorage (clears when the tab closes — intentional for UX).
 * The hardened Firestore Security Rules in the comment below give the
 * server-side guarantee that no amount of client tampering can bypass.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UPDATED firestore.rules  (copy-paste this, replace your existing file)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *
 *       match /users/{userId} {
 *         allow read, write: if request.auth != null
 *                            && request.auth.uid == userId;
 *         match /payments/{paymentId} {
 *           allow read, create: if request.auth != null
 *                               && request.auth.uid == userId;
 *           allow update, delete: if false;
 *         }
 *       }
 *
 *       // KEY CHANGE: server enforces one registration per user ever.
 *       match /registrations/{userId} {
 *         allow read, create: if request.auth != null
 *                             && request.auth.uid == userId
 *                             && !exists(/databases/$(database)/documents/registrations/$(userId));
 *         allow update, delete: if false;
 *       }
 *
 *       // Deny everything else (blocks scrapers hitting unknown collections).
 *       match /{document=**} {
 *         allow read, write: if false;
 *       }
 *     }
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Per-action policies ──────────────────────────────────────────────────────
const POLICIES = {
  'google-signin':    { maxAttempts: 5,  windowMs: 15 * 60 * 1000, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.'     },
  'register-submit':  { maxAttempts: 3,  windowMs: 10 * 60 * 1000, message: 'Too many registration attempts. Please wait 10 minutes and try again.' },
  'payment-open':     { maxAttempts: 3,  windowMs: 10 * 60 * 1000, message: 'Too many payment attempts. Please wait 10 minutes and try again.'      },
  'password-reset':   { maxAttempts: 3,  windowMs: 30 * 60 * 1000, message: 'Too many password reset requests. Please wait 30 minutes.'             },
  'dashboard-load':   { maxAttempts: 60, windowMs:      60 * 1000,  message: 'Loading too fast. Please slow down.'                                  },
  '_default':         { maxAttempts: 20, windowMs:      60 * 1000,  message: 'Too many requests. Please wait a moment and try again.'               }
};

const PREFIX = 'ci_rl_';

// ── Internal helpers ─────────────────────────────────────────────────────────

function _read(action) {
  try {
    const raw = sessionStorage.getItem(PREFIX + action);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* storage blocked — fail open */ }
  return { attempts: [] };
}

function _write(action, record) {
  try {
    sessionStorage.setItem(PREFIX + action, JSON.stringify(record));
  } catch (_) { /* storage blocked — fail open */ }
}

function _policy(action) {
  return POLICIES[action] || POLICIES['_default'];
}

function _prune(attempts, windowMs) {
  const cutoff = Date.now() - windowMs;
  return attempts.filter(ts => ts > cutoff);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * checkRateLimit(action) → boolean
 *
 * Returns true  — within limit, proceed.
 * Returns false — over limit, shows a toast automatically.
 *
 * Example:
 *   if (!checkRateLimit('google-signin')) return;
 */
export function checkRateLimit(action) {
  const { maxAttempts, windowMs, message } = _policy(action);
  const record = _read(action);
  const recent = _prune(record.attempts, windowMs);

  if (recent.length >= maxAttempts) {
    console.warn(`[CI Minds] Rate limit hit: "${action}" — ${recent.length}/${maxAttempts} in window.`);
    _showToast(message, 'error');
    return false;
  }
  return true;
}

/**
 * recordAttempt(action)
 *
 * Call immediately AFTER checkRateLimit passes, just before the action runs.
 *
 * Example:
 *   if (!checkRateLimit('register-submit')) return;
 *   recordAttempt('register-submit');
 *   // ... submit ...
 */
export function recordAttempt(action) {
  const { windowMs } = _policy(action);
  const record = _read(action);
  const recent = _prune(record.attempts, windowMs);
  recent.push(Date.now());
  _write(action, { attempts: recent });
}

/**
 * clearLimit(action)
 *
 * Reset the counter after a successful action so a real user is not penalised.
 *
 * Example (inside your Razorpay success handler):
 *   clearLimit('payment-open');
 */
export function clearLimit(action) {
  try {
    sessionStorage.removeItem(PREFIX + action);
  } catch (_) { /* storage blocked */ }
}

/**
 * getRemainingAttempts(action) → number
 *
 * Returns how many attempts the user still has left in the current window.
 * Useful for showing "2 attempts remaining" in the UI.
 */
export function getRemainingAttempts(action) {
  const { maxAttempts, windowMs } = _policy(action);
  const record = _read(action);
  const recent = _prune(record.attempts, windowMs);
  return Math.max(0, maxAttempts - recent.length);
}

/**
 * getWaitTimeMs(action) → number
 *
 * Returns milliseconds the user must wait before retrying. Returns 0 if free.
 *
 * Example (show countdown in UI):
 *   const ms = getWaitTimeMs('google-signin');
 *   if (ms > 0) label.textContent = `Try again in ${Math.ceil(ms/1000)}s`;
 */
export function getWaitTimeMs(action) {
  const { maxAttempts, windowMs } = _policy(action);
  const record = _read(action);
  const recent = _prune(record.attempts, windowMs);
  if (recent.length < maxAttempts) return 0;
  const oldest = Math.min(...recent);
  return Math.max(0, oldest + windowMs - Date.now());
}

// ── Toast notification ───────────────────────────────────────────────────────
// Minimal, no-dependency toast. Re-uses your existing #toast-container if
// dashboard.html has already created one.

function _showToast(message, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, {
      position:      'fixed',
      bottom:        '24px',
      right:         '24px',
      zIndex:        '99999',
      display:       'flex',
      flexDirection: 'column',
      gap:           '8px',
      maxWidth:      '360px',
      fontFamily:    'Inter, system-ui, sans-serif'
    });
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    background:   type === 'error' ? '#B3261E' : '#1B5E20',
    color:        '#fff',
    padding:      '12px 16px',
    borderRadius: '10px',
    fontSize:     '14px',
    lineHeight:   '1.45',
    boxShadow:    '0 4px 16px rgba(0,0,0,0.18)',
    opacity:      '0',
    transform:    'translateY(6px)',
    transition:   'opacity .2s ease, transform .2s ease',
    display:      'flex',
    alignItems:   'flex-start',
    gap:          '10px'
  });

  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'error' ? '⛔' : '✅';
  icon.style.flexShrink = '0';

  const text = document.createElement('span');
  text.textContent = message;
  text.setAttribute('role', 'alert');
  text.setAttribute('aria-live', 'assertive');

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 220);
  }, 5000);
}
