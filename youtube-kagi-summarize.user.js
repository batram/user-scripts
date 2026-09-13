// ==UserScript==
// @name         YouTube Kagi Summarize Button
// @namespace    http://tampermonkey.net
// @version      1.7
// @description  Adds a Kagi Summarize button to YouTube (watch page + video "more actions" menus)
// @author       Your Name
// @match        https://www.youtube.com/*
// @icon         https://kagi.com/favicon.ico
// @grant        unsafeWindow
// @grant        GM_openInTab
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[Kagi]';
    console.log(TAG, 'userscript loaded');

    // ---------------------------------------------------------------------
    // Selectors
    // ---------------------------------------------------------------------
    const ACTION_BUTTON_SELECTOR = [
        'button[aria-label="More actions"]',
        'button[aria-label="Weitere Aktionen"]',
        'button.ytSpecButtonShapeNextIconButton',
    ].join(',');

    const VIDEO_CONTAINER_SELECTOR = [
        'yt-lockup-view-model',
        'yt-lockup-metadata-view-model',
        'yt-video-card-view-model',
        'yt-compact-video-view-model',
        'ytd-rich-grid-media',
        'ytd-rich-item-renderer',
        'ytd-compact-video-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-playlist-video-renderer',
        'ytd-reel-item-renderer',
    ].join(',');

    const VIDEO_LINK_SELECTOR = [
        'a#thumbnail[href]',
        'a.ytd-thumbnail[href]',
        'a[href*="/watch?"]',
        'a[href*="/shorts/"]',
        'a.yt-core-attributed-string__link[href]',
    ].join(',');

    const POPUP_MENU_SELECTOR = 'ytd-popup-container yt-list-view-model, tp-yt-iron-dropdown yt-list-view-model';

    let lastClickedVideoUrl = '';

    // ---------------------------------------------------------------------
    // Helpers — no innerHTML anywhere (avoids CSP / Trusted Types sinks,
    // which behave differently between Chrome and Firefox)
    // ---------------------------------------------------------------------
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (key === 'style') node.style.cssText = value;
            else if (key === 'class') node.className = value;
            else node.setAttribute(key, value);
        }
        for (const child of children) node.append(child);
        return node;
    }

    function kagiIcon() {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.style.cssText = 'width:20px;height:20px;fill:currentColor;pointer-events:none;';
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z');
        svg.appendChild(path);
        return svg;
    }

    function cleanVideoUrl(url) {
        try {
            const u = new URL(url, location.origin);
            const v = u.searchParams.get('v');
            if (v) return 'https://www.youtube.com/watch?v=' + v;
            u.search = '';
            return u.href;
        } catch (e) {
            return url;
        }
    }

    function openKagiSummary(videoUrl) {
        if (!videoUrl) {
            console.warn(TAG, 'no video URL available');
            return;
        }
        const kagiUrl = 'https://kagi.com/summarizer?target_language=&summary=keypoints&length=medium&url='
            + encodeURIComponent(cleanVideoUrl(videoUrl));
        console.log(TAG, 'opening', kagiUrl);
        if (typeof GM_openInTab === 'function') {
            GM_openInTab(kagiUrl, { active: true, insert: true });
        } else {
            window.open(kagiUrl, '_blank');
        }
    }

    // ---------------------------------------------------------------------
    // 1. Watch page: button next to Like / Share / ...
    // ---------------------------------------------------------------------
    function injectWatchPageButton() {
        const actionsMenu = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer #items');
        if (!actionsMenu || actionsMenu.querySelector('.kagi-watch-btn')) return;

        const button = el('button', {
            class: 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading',
            title: 'Summarize with Kagi',
            'aria-label': 'Summarize with Kagi',
            style: 'margin-left:8px;border-radius:18px;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;height:36px;padding:0 16px;white-space:nowrap;cursor:pointer;',
        },
            el('div', { style: 'margin-right:6px;display:flex;align-items:center;justify-content:center;pointer-events:none;' }, kagiIcon()),
            el('span', { style: 'font-size:14px;font-weight:500;line-height:36px;display:inline-block;pointer-events:none;' }, 'Summarize'),
        );

        const container = el('div', {
            class: 'kagi-watch-btn style-scope ytd-menu-renderer',
            style: 'display:inline-flex;align-items:center;',
        }, button);

        container.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openKagiSummary(location.href);
        }, true);

        actionsMenu.appendChild(container);
        console.log(TAG, 'watch page button injected');
    }

    // ---------------------------------------------------------------------
    // 2. Remember which video's "more actions" button was pressed
    // ---------------------------------------------------------------------
    document.addEventListener('pointerdown', (event) => {
        let target = event.target;
        if (target && target.nodeType !== 1) target = target.parentElement;
        if (!target) return;

        const actionButton = target.closest(ACTION_BUTTON_SELECTOR);
        if (!actionButton) return;

        const videoContainer = actionButton.closest(VIDEO_CONTAINER_SELECTOR);
        const anchor = videoContainer && videoContainer.querySelector(VIDEO_LINK_SELECTOR);

        lastClickedVideoUrl = anchor && anchor.href ? anchor.href : '';
        console.log(TAG, 'context video:', lastClickedVideoUrl || '(none)');
    }, true);

    // ---------------------------------------------------------------------
    // 3. Add "Summarize with Kagi" entry to the popup context menu
    // ---------------------------------------------------------------------
    function injectDropdownMenuButton() {
        const popupMenu = document.querySelector(POPUP_MENU_SELECTOR);
        if (!popupMenu || popupMenu.querySelector('.kagi-dropdown-item')) return;

        const menuItem = el('yt-list-item-view-model', {
            class: 'kagi-dropdown-item ytListItemViewModelHost',
            role: 'menuitem',
            tabindex: '0',
            style: 'cursor:pointer;',
        },
            el('div', {
                class: 'ytListItemViewModelLayoutWrapper ytListItemViewModelContainer ytListItemViewModelCompact ytListItemViewModelTappable ytListItemViewModelInPopup ytListItemViewModelNoTrailingText',
                style: 'pointer-events:none;',
            },
                el('div', { class: 'ytListItemViewModelMainContainer' },
                    el('div', { class: 'ytListItemViewModelImageContainer ytListItemViewModelLeading', 'aria-hidden': 'true' },
                        el('span', {
                            class: 'ytIconWrapperHost ytListItemViewModelAccessory ytListItemViewModelImage',
                            style: 'display:flex;align-items:center;justify-content:center;color:var(--yt-spec-text-primary);',
                        }, kagiIcon()),
                    ),
                    el('button', { class: 'ytButtonOrAnchorHost ytButtonOrAnchorButton ytListItemViewModelButtonOrAnchor ytListItemViewModelTextWrapper' },
                        el('div', {},
                            el('div', { class: 'ytListItemViewModelTitleWrapper' },
                                el('span', {
                                    class: 'ytAttributedStringHost ytListItemViewModelTitle ytAttributedStringWhiteSpacePreWrap',
                                    role: 'text',
                                    style: 'font-size:14px;color:var(--yt-spec-text-primary);',
                                }, 'Summarize with Kagi'),
                            ),
                        ),
                    ),
                ),
            ),
        );

        menuItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openKagiSummary(lastClickedVideoUrl || (location.pathname === '/watch' ? location.href : ''));
            document.body.click(); // close the popup
        }, true);

        popupMenu.insertBefore(menuItem, popupMenu.firstChild);
        console.log(TAG, 'dropdown item injected');
    }

    // ---------------------------------------------------------------------
    // Observe SPA DOM changes
    // ---------------------------------------------------------------------
    function tick() {
        if (location.pathname === '/watch') injectWatchPageButton();
        injectDropdownMenuButton();
    }

    const observer = new MutationObserver(tick);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    tick();
})();
