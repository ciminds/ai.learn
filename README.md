# CI Minds — AI Fast-Track Course Platform

A web-based learning platform with Google OAuth authentication and cloud progress sync via Firebase.

## Project Structure

```
ci-minds/
├── index.html          # Landing page + Sign In / Sign Up
├── dashboard.html      # Course dashboard (protected — requires login)
├── firebase-config.js  # Firebase setup, auth helpers, Firestore helpers
├── .gitignore
└── README.md
```

## Tech Stack

- **Frontend:** Vanilla HTML, Tailwind CSS (CDN), Vanilla JS
- **Auth:** Firebase Authentication (Google OAuth + Email/Password)
- **Database:** Cloud Firestore (progress sync across devices)
- **Hosting:** Firebase Hosting (or Netlify / GitHub Pages)

## Firebase Services Used

| Service | Purpose |
|---|---|
| Authentication | Google Sign-In, Email/Password Sign-Up |
| Firestore | Save & sync course progress per user |
| Analytics | Page-level usage tracking |

## Setup

1. Clone the repo
2. Open Firebase Console → your project → Authentication → Sign-in method
3. Enable **Google** and **Email/Password**
4. Open Firebase Console → Firestore Database → Create database
5. Add your domain to **Authorized Domains** (Authentication → Settings)
6. Deploy (see below) — never open as `file://`, must be served over HTTP

## Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Set public directory to: . (current folder)
# Single-page app: No
firebase deploy
```

## Deploy to Netlify (drag & drop)

1. Go to [app.netlify.com](https://app.netlify.com)
2. Drag your project folder onto the deploy area
3. Copy the live URL Netlify gives you
4. Add it to Firebase Authorized Domains

## OAuth Authorized Domains

After deploying, add your live URL to:
**Firebase Console → Authentication → Settings → Authorized domains**

Examples:
- `ciminds.web.app` (Firebase Hosting)
- `your-site.netlify.app` (Netlify)
- `yourusername.github.io` (GitHub Pages)

---

## Dashboard — File Split (v2.0)

The `dashboard.html` has been split into three separate asset files for cleaner architecture, faster loading, and easier maintenance. Place all three files in an `assets/` folder alongside `dashboard.html`.

```
ci-minds/
├── index.html              # Landing page + Sign In / Sign Up (unchanged)
├── dashboard.html          # Course dashboard — now links to assets below
├── firebase-config.js      # Firebase setup, auth helpers, Firestore helpers
├── assets/
│   ├── style.css           # All dashboard styles (dark theme, responsive)
│   ├── app.js              # Core app logic (data, routing, render functions)
│   └── payment.js          # Payment & Auth module (ESM, requires Firebase)
├── .gitignore
└── README.md
```

### What each file does

| File | Size | Purpose |
|---|---|---|
| `assets/style.css` | ~27 KB | Carbon·Violet dark theme, responsive layout, all component styles |
| `assets/app.js` | ~313 KB | Course data, state management, navigation, all render functions |
| `assets/payment.js` | ~38 KB | Razorpay payment flow + Firebase auth listener (ESM module) |

### Adding the files

1. Create an `assets/` folder in your project root (same level as `dashboard.html`)
2. Download `style.css`, `app.js`, and `payment.js` individually (see below)
3. Place all three inside the `assets/` folder
4. `dashboard.html` already references them as `./assets/style.css`, `./assets/app.js`, and `./assets/payment.js` — no changes needed

### Configuring payment.js

Open `assets/payment.js` and fill in your values at the top of the file:

```js
const RAZORPAY_KEY_ID    = 'rzp_live_YOUR_KEY_HERE';
const VERIFY_PAYMENT_URL = 'https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/verifyPayment';
```

### Design System — Token Reference

| CSS Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0D0D0D` | Page background |
| `--surface` | `#111111` | Sidebar, header |
| `--surface-2` | `#171717` | Cards (Carbon) |
| `--surface-3` | `#1E1E1E` | Elevated elements |
| `--violet` | `#6366F1` | Accent — active states, progress bars |
| `--violet-dark` | `#4F46E5` | Buttons, logo icon |
| `--violet-light` | `#818CF8` | Muted numbers, tags |
| `--text` | `#F0EFFF` | Primary text |
| `--text-muted` | `rgba(240,239,255,0.45)` | Secondary text |
| `--border` | `rgba(255,255,255,0.07)` | Subtle borders |

Font: **Nunito** — loaded from Google Fonts, weights 300–900.

### Responsive Breakpoints

| Breakpoint | Behaviour |
|---|---|
| `≥ 768px` (desktop) | Sidebar always visible, full layout, `32px` page padding |
| `768–1024px` (tablet) | Sidebar visible, `20px` page padding |
| `< 768px` (mobile) | Bottom nav + slide-in drawer, `14px` page padding, touch-optimised |

### Bug Fixes in v2.0

- **Black dimmed screen on load** — overlay no longer fires on page open; only activates when the mobile drawer is explicitly opened
- **Tutorial `?` button** — fixed event listener timing; button now reliably opens the onboarding guide on first load and on replay
- **Overlay pointer-events leak** — closed overlay no longer intercepts clicks on the page beneath it

### Security Notes

- `firebase-config.js` contains API keys — add it to `.gitignore` for private repos or restrict keys in Google Cloud Console
- Payment verification is server-side only via Cloud Functions; `enrolled: true` is never written from the client
- All lesson content is watermarked per user and copy-protected
