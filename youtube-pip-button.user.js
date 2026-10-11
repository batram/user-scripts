// ==UserScript==
// @name         YouTube Picture-in-Picture Button
// @namespace    http://tampermonkey.net
// @version      1.0
// @homepageURL  https://github.com/batram/user-scripts
// @supportURL   https://github.com/batram/user-scripts/issues
// @updateURL    https://raw.githubusercontent.com/batram/user-scripts/master/youtube-pip-button.user.js
// @downloadURL  https://raw.githubusercontent.com/batram/user-scripts/master/youtube-pip-button.user.js
// @description  Adds a picture-in-picture button to the YouTube player controls (desktop, mobile and embeds)
// @author       batram
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.youtube-nocookie.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Sub-frames on youtube.com (ads, chat, service iframes) have no player of
    // their own; only embedded players are worth running in
    if (window.top !== window && !location.pathname.startsWith('/embed/')) return;

    const TAG = '[PiP]';
    const BTN_CLASS = 'ytpip-button';

    // ---------------------------------------------------------------------
    // What this engine can do
    //   standard: HTMLVideoElement.requestPictureInPicture (Chromium, Once desktop, Safari)
    //   webkit:   webkitSetPresentationMode (older iOS / WKWebView)
    //   hint:     desktop Firefox has PiP, but only through its own UI — explain how
    //   none:     Gecko on Android (Firefox, Once mobile) has no way in — no button
    // ---------------------------------------------------------------------
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isGecko = /Gecko\/\d/.test(navigator.userAgent) && !/like Gecko/.test(navigator.userAgent);
    const isMac = /Mac/.test(navigator.platform || navigator.userAgent);

    function pipMode() {
        if ('pictureInPictureEnabled' in document) {
            return document.pictureInPictureEnabled ? 'standard' : 'none';
        }
        const probe = HTMLVideoElement.prototype;
        if (typeof probe.webkitSetPresentationMode === 'function') return 'webkit';
        if (isGecko && !isAndroid) return 'hint';
        return 'none';
    }

    const MODE = pipMode();
    console.log(TAG, 'mode:', MODE);
    if (MODE === 'none') return;

    const FIREFOX_SHORTCUT = isMac ? '⌘ ⌥ ⇧ ]' : 'Ctrl+Shift+]';

    // ---------------------------------------------------------------------
    // Helpers — no innerHTML (YouTube enforces Trusted Types)
    // ---------------------------------------------------------------------
    const SVG_NS = 'http://www.w3.org/2000/svg';
    // Enter: YouTube's own (normally hidden) PiP glyph, so it matches the other controls
    const ICON_ENTER = 'M1 6a2 2 0 012-2h18a2 2 0 012 2v12a2 2 0 01-2 2H3a2 2 0 01-2-2V6Zm2 0v12h18V6H3Zm16 6h-6v4h6v-4Z';
    // Exit: same frame, the small window filled into the full frame
    const ICON_EXIT = 'M1 6a2 2 0 012-2h18a2 2 0 012 2v12a2 2 0 01-2 2H3a2 2 0 01-2-2V6Zm2 0v12h18V6H3Zm2 2h14v8H5V8Z';

    function icon(size) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', ICON_ENTER);
        svg.appendChild(path);
        return svg;
    }

    function addStyle() {
        if (document.getElementById('ytpip-style')) return;
        const style = document.createElement('style');
        style.id = 'ytpip-style';
        style.textContent = `
            .${BTN_CLASS}.ytp-button { display: inline-flex; align-items: center; justify-content: center; }
            .${BTN_CLASS}.ytp-button svg { pointer-events: none; }
            .ytpip-mobile { display: block; }
            .ytpip-mobile .${BTN_CLASS} {
                width: 48px; height: 48px; padding: 12px; margin: 0; border: 0;
                background: none; color: #fff; cursor: pointer; display: block;
                -webkit-tap-highlight-color: transparent;
            }
            .ytpip-mobile .${BTN_CLASS} svg { display: block; width: 24px; height: 24px; fill: #fff; pointer-events: none; }
            .ytpip-toast {
                position: absolute; left: 50%; top: 12%; transform: translateX(-50%);
                z-index: 70; max-width: 80%; padding: 8px 14px; border-radius: 8px;
                background: rgba(28, 28, 28, .9); color: #fff; text-align: center;
                font: 500 14px/1.4 "YouTube Noto", Roboto, Arial, sans-serif;
                pointer-events: none; opacity: 0; transition: opacity .2s;
            }
            .ytpip-toast.ytpip-show { opacity: 1; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function mainVideo(from) {
        const player = from && from.closest('#movie_player, .html5-video-player');
        return (player && player.querySelector('video.html5-main-video'))
            || document.querySelector('#movie_player video.html5-main-video, video.html5-main-video');
    }

    function playerOf(from) {
        return (from && from.closest('#movie_player, .html5-video-player'))
            || document.querySelector('#movie_player, .html5-video-player');
    }

    // ---------------------------------------------------------------------
    // Picture-in-picture
    // ---------------------------------------------------------------------
    function isActive() {
        if (MODE === 'standard') return !!document.pictureInPictureElement;
        if (MODE === 'webkit') {
            const v = mainVideo();
            return !!v && v.webkitPresentationMode === 'picture-in-picture';
        }
        return false;
    }

    function toggle(button) {
        const video = mainVideo(button);
        if (!video) return;

        if (MODE === 'hint') {
            toast(button, `Press ${FIREFOX_SHORTCUT} for picture-in-picture, or use the toggle on the video`);
            return;
        }

        // m.youtube.com marks the video disablepictureinpicture; it would make the request fail
        video.disablePictureInPicture = false;
        video.removeAttribute('disablepictureinpicture');

        if (MODE === 'webkit') {
            const next = video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
            try {
                video.webkitSetPresentationMode(next);
            } catch (e) {
                console.warn(TAG, e);
                toast(button, 'Picture-in-picture is not available here');
            }
            return;
        }

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch((e) => console.warn(TAG, e));
            return;
        }
        // Must run synchronously inside the click: PiP requires a user gesture
        video.requestPictureInPicture().catch((e) => {
            console.warn(TAG, e);
            toast(button, video.readyState === 0
                ? 'Start the video first, then try picture-in-picture'
                : 'Picture-in-picture is not available here');
        });
    }

    // Keep every button's icon/label in sync with the actual PiP state
    function syncButtons() {
        const active = isActive();
        document.querySelectorAll('.' + BTN_CLASS).forEach((b) => {
            const label = active ? 'Exit picture-in-picture' : 'Picture-in-picture';
            if (b.getAttribute('aria-pressed') === String(active)) return;
            b.setAttribute('aria-pressed', String(active));
            b.setAttribute('aria-label', label);
            if (b.hasAttribute('title')) b.setAttribute('title', label);
            const path = b.querySelector('path');
            if (path) path.setAttribute('d', active ? ICON_EXIT : ICON_ENTER);
        });
    }

    ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged'].forEach((type) => {
        // These don't bubble; capture on document still sees them
        document.addEventListener(type, () => setTimeout(syncButtons), true);
    });

    // ---------------------------------------------------------------------
    // Keep playing while in PiP: m.youtube.com pauses on visibilitychange when the
    // tab or app goes to the background, which is exactly when PiP matters.
    // Registered at document-start so it runs before YouTube's own listeners.
    // ---------------------------------------------------------------------
    function hideVisibility(event) {
        if (isActive()) event.stopImmediatePropagation();
    }
    window.addEventListener('visibilitychange', hideVisibility, true);
    window.addEventListener('webkitvisibilitychange', hideVisibility, true);
    try {
        const proto = Document.prototype;
        const hidden = Object.getOwnPropertyDescriptor(proto, 'hidden');
        const state = Object.getOwnPropertyDescriptor(proto, 'visibilityState');
        if (hidden && hidden.get && state && state.get) {
            Object.defineProperty(proto, 'hidden', {
                configurable: true, enumerable: true,
                get() { return isActive() ? false : hidden.get.call(this); },
            });
            Object.defineProperty(proto, 'visibilityState', {
                configurable: true, enumerable: true,
                get() { return isActive() ? 'visible' : state.get.call(this); },
            });
        }
    } catch (e) {
        console.warn(TAG, 'visibility override unavailable', e);
    }

    // ---------------------------------------------------------------------
    // Toast (Firefox hint, errors)
    // ---------------------------------------------------------------------
    let toastTimer = 0;
    function toast(from, text) {
        const player = playerOf(from);
        if (!player) return;
        let node = player.querySelector('.ytpip-toast');
        if (!node) {
            node = document.createElement('div');
            node.className = 'ytpip-toast';
            node.setAttribute('role', 'status');
            player.appendChild(node);
        }
        node.textContent = text;
        // force a frame so the fade-in runs
        void node.offsetWidth;
        node.classList.add('ytpip-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => node.classList.remove('ytpip-show'), 3500);
    }

    // ---------------------------------------------------------------------
    // Desktop tooltip: YouTube binds its tooltip to its own buttons only, and creates
    // its element lazily. Use a private element built from the same classes, so it
    // looks identical without touching YouTube's tooltip state.
    // ---------------------------------------------------------------------
    function tooltipFor(player) {
        let tip = player.querySelector('.ytpip-tooltip');
        if (tip) return tip;
        tip = document.createElement('div');
        tip.className = 'ytp-tooltip ytp-bottom ytpip-tooltip';
        tip.setAttribute('data-layer', '4');
        // YouTube's CSS fades a tooltip in when aria-hidden is dropped
        tip.setAttribute('aria-hidden', 'true');
        tip.style.pointerEvents = 'none';
        const wrapper = document.createElement('div');
        wrapper.className = 'ytp-tooltip-text-wrapper';
        const bottom = document.createElement('div');
        bottom.className = 'ytp-tooltip-bottom-text';
        const text = document.createElement('span');
        text.className = 'ytp-tooltip-text';
        bottom.appendChild(text);
        wrapper.appendChild(bottom);
        tip.appendChild(wrapper);
        player.appendChild(tip);
        return tip;
    }

    function showTooltip(button) {
        const player = playerOf(button);
        if (!player) return;
        const tip = tooltipFor(player);
        tip.querySelector('.ytp-tooltip-text').textContent = button.getAttribute('aria-label');
        const p = player.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        const w = tip.offsetWidth;
        // Same placement as YouTube's own: centred on the button, ~22px above it
        const left = Math.max(12, Math.min(b.left - p.left + b.width / 2 - w / 2, p.width - w - 12));
        tip.style.left = left + 'px';
        tip.style.top = (b.top - p.top - tip.offsetHeight - 22) + 'px';
        tip.removeAttribute('aria-hidden');
    }

    function hideTooltip(button) {
        const tip = playerOf(button)?.querySelector('.ytpip-tooltip');
        if (tip) tip.setAttribute('aria-hidden', 'true');
    }

    // ---------------------------------------------------------------------
    // Buttons
    // ---------------------------------------------------------------------
    function makeButton(extraClass) {
        const label = 'Picture-in-picture';
        const tip = MODE === 'hint' ? `${label} (${FIREFOX_SHORTCUT})` : label;
        const b = document.createElement('button');
        b.className = `${BTN_CLASS} ${extraClass}`.trim();
        b.type = 'button';
        b.setAttribute('aria-label', tip);
        b.setAttribute('aria-pressed', 'false');
        b.appendChild(icon(24));
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(b);
        });
        return b;
    }

    // Desktop / embed player: ".ytp-right-controls", next to Theater / Full screen
    function injectDesktop() {
        document.querySelectorAll('.html5-video-player:not(.ytp-mweb-player)').forEach((player) => {
            if (player.querySelector('.ytp-chrome-bottom .' + BTN_CLASS)) return;
            const anchor = player.querySelector('.ytp-chrome-bottom .ytp-size-button')
                || player.querySelector('.ytp-chrome-bottom .ytp-fullscreen-button');
            if (!anchor) return;
            const b = makeButton('ytp-button');
            b.addEventListener('mouseenter', () => showTooltip(b));
            b.addEventListener('focus', () => showTooltip(b));
            b.addEventListener('mouseleave', () => hideTooltip(b));
            b.addEventListener('blur', () => hideTooltip(b));
            b.addEventListener('click', () => hideTooltip(b));
            anchor.parentNode.insertBefore(b, anchor);
            syncButtons();
            console.log(TAG, 'desktop button injected');
        });
    }

    // m.youtube.com: the top-right row (autoplay, captions, settings)
    function injectMobile() {
        const row = document.querySelector('.player-controls-top');
        if (!row || row.querySelector('.' + BTN_CLASS)) return;
        const b = makeButton('icon-button');
        b.setAttribute('title', b.getAttribute('aria-label'));
        const wrap = document.createElement('div');
        wrap.className = 'ytpip-mobile';
        wrap.appendChild(b);
        const settings = row.querySelector('.player-settings-icon');
        const before = settings ? settings.closest('.player-controls-top > *') : null;
        row.insertBefore(wrap, before);
        syncButtons();
        console.log(TAG, 'mobile button injected');
    }

    // ---------------------------------------------------------------------
    // Observe SPA DOM changes (the player is built lazily and rebuilt on navigation)
    // ---------------------------------------------------------------------
    let queued = false;
    function tick() {
        queued = false;
        addStyle();
        injectDesktop();
        injectMobile();
    }
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(tick);
    }

    function start() {
        new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
        schedule();
    }
    if (document.documentElement) start();
    else document.addEventListener('readystatechange', start, { once: true });
})();
