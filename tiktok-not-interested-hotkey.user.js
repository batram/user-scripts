// ==UserScript==
// @name         TikTok "Not interested" Hotkey
// @namespace    http://tampermonkey.net
// @version      1.0
// @description  Press N on the TikTok feed to mark the current video as "Not interested" (opens the "..." menu and clicks the item for you)
// @author       mjb
// @match        https://www.tiktok.com/*
// @icon         https://www.tiktok.com/favicon.ico
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const HOTKEY = 'n';          // plain key, no modifiers
    const POPOVER_TIMEOUT = 1500; // ms to wait for the "..." popover to render

    // Selectors observed on tiktok.com/foryou (2026-09):
    //   article[data-e2e="recommend-list-item-container"]   one feed item
    //   button[data-e2e="more-menu-icon"]                   the "..." button
    //   .TUXPopover-popover--open                           the open popover
    //   [data-e2e="more-menu-popover_not-interested"]       the menu item
    const ARTICLE_SEL = 'article[data-e2e="recommend-list-item-container"]';
    const MORE_SEL = 'button[data-e2e="more-menu-icon"]';
    const POPOVER_SEL = '.TUXPopover-popover--open';
    const ITEM_SEL = '[data-e2e="more-menu-popover_not-interested"]';

    function isTypingTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    // The feed item the user is looking at: prefer the one whose video is playing,
    // fall back to the one closest to the top of the viewport.
    function currentArticle() {
        const articles = [...document.querySelectorAll(ARTICLE_SEL)];
        if (!articles.length) return null;
        const playing = articles.find((a) => {
            const v = a.querySelector('video');
            return v && !v.paused && !v.ended;
        });
        if (playing) return playing;
        return articles.reduce((best, a) => {
            const d = Math.abs(a.getBoundingClientRect().top);
            return d < best.d ? { a, d } : best;
        }, { a: null, d: Infinity }).a;
    }

    function waitFor(selector, timeout) {
        return new Promise((resolve) => {
            const found = document.querySelector(selector);
            if (found) return resolve(found);
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { obs.disconnect(); clearTimeout(t); resolve(el); }
            });
            // The popover node persists and only toggles its "--open" class, so watch attributes too.
            obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            const t = setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
        });
    }

    let busy = false;

    async function markNotInterested() {
        if (busy) return;
        busy = true;
        try {
            const article = currentArticle();
            // On single-video pages there is no article; take the first "..." on the page.
            const more = (article || document).querySelector(MORE_SEL);
            if (!more) { console.warn('[tiktok-not-interested] no "..." button found'); return; }

            if (more.getAttribute('aria-expanded') !== 'true') more.click();

            const popover = await waitFor(POPOVER_SEL, POPOVER_TIMEOUT);
            const item = popover && popover.querySelector(ITEM_SEL);
            if (!item) {
                console.warn('[tiktok-not-interested] "Not interested" item not found');
                if (more.getAttribute('aria-expanded') === 'true') more.click(); // close it again
                return;
            }
            item.click();
        } finally {
            busy = false;
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== HOTKEY) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        markNotInterested();
    }, true);
})();
