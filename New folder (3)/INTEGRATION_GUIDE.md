# CI Minds — Rate Limiting Integration Guide

Two files to add to your project. No npm, no new dependencies.

---

## Files

| File | What it does |
|---|---|
| `rate-limiter.js` | Client-side throttle module (drop alongside your other JS files) |
| `firestore.rules` | Replace your existing `firestore.rules` — adds server-side enforcement |

---

## Step 1 — Deploy the new Firestore rules

```bash
firebase deploy --only firestore:rules
```

That's it for the server side. The `!exists(...)` guard in `registrations/{userId}`
means even a user who disables JavaScript in their browser can never register twice.

---

## Step 2 — Add rate-limiter.js to your project

Copy `rate-limiter.js` into your project root (next to `firebase-config.js`).

---

## Step 3 — Wire it into register.html

Inside your existing `<script type="module">` block, add the import at the top:

```js
import { checkRateLimit, recordAttempt, clearLimit } from './rate-limiter.js';
```

### 3a. Protect the Google sign-in button

Find your `signInWithGooglePopup()` call (around line 615 in register.html)
and wrap it:

```js
// BEFORE (your current code):
await signInWithGooglePopup();

// AFTER:
if (!checkRateLimit('google-signin')) return;
recordAttempt('google-signin');
try {
  await signInWithGooglePopup();
  clearLimit('google-signin');   // success — reset counter
} catch (err) {
  // existing error handling unchanged
}
```

### 3b. Protect the registration form submit

Find the code that calls `saveRegistration(...)` (around line 457) and wrap it:

```js
// BEFORE:
await saveRegistration(uid, { ... });

// AFTER:
if (!checkRateLimit('register-submit')) return;
recordAttempt('register-submit');
const ok = await saveRegistration(uid, { ... });
if (ok) clearLimit('register-submit');
```

### 3c. Protect the Razorpay payment button

Find where `new Razorpay(options)` is called (around line 749) and wrap it:

```js
// BEFORE:
const rzp = new Razorpay(options);
rzp.open();

// AFTER:
if (!checkRateLimit('payment-open')) return;
recordAttempt('payment-open');
const rzp = new Razorpay(options);
rzp.on('payment.failed', () => {
  // your existing handler — do NOT clearLimit here
});
// Inside the handler.success callback:
//   clearLimit('payment-open');
rzp.open();
```

---

## Step 4 — Wire it into index.html (optional, for sign-in on landing page)

If your landing page has a sign-in flow, add the same import and wrap any
`signInWithGoogle*` call with:

```js
if (!checkRateLimit('google-signin')) return;
recordAttempt('google-signin');
```

---

## Step 5 — Wire it into dashboard.html (optional, for content scraping protection)

Inside the function that loads course content/modules add:

```js
if (!checkRateLimit('dashboard-load')) return;
recordAttempt('dashboard-load');
```

The limit is 60 loads per minute — a real user will never hit it, but a bot
running a scraper loop will be stopped immediately.

---

## What protection does this give you?

| Attack | Client defence | Server defence |
|---|---|---|
| Bot spam-clicking "Sign in with Google" | Blocked after 5 attempts/15 min | Firebase Auth has built-in `auth/too-many-requests` |
| Bot submitting the registration form repeatedly | Blocked after 3 attempts/10 min | `!exists(...)` rule — only 1 doc per user ever |
| Bot hammering Razorpay | Blocked after 3 attempts/10 min | Razorpay's own fraud detection |
| Scraper hitting the dashboard | Blocked after 60 loads/min | Firestore Security Rules — only owner can read |
| DDoS on unknown Firestore paths | N/A | Catch-all `allow read, write: if false` |

### What this does NOT protect against
- **Volumetric DDoS on Firebase Hosting** (static file serving) — use
  Cloudflare's free plan in front of your Firebase Hosting domain for that.
- **Multiple accounts from the same IP** — Firebase Auth handles this with
  its own server-side limits, and Razorpay has fraud detection for cards.

---

## Tuning the limits

All limits live in the `POLICIES` object at the top of `rate-limiter.js`.
Change `maxAttempts` or `windowMs` without touching anything else:

```js
'google-signin': { maxAttempts: 5, windowMs: 15 * 60 * 1000, ... },
//                 ↑ change this    ↑ or this (in milliseconds)
```

---

*No backend required. No new Firebase services. No billing impact.*
