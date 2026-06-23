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
