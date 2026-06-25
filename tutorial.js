// CBK Innovative Minds — Onboarding Tutorial
// © CBK Innovative Minds. All rights reserved.
// Simple centered modal guide — works on all screen sizes including mobile.

'use strict';

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
