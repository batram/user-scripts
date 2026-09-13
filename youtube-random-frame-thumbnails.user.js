// ==UserScript==
// @name         YouTube Random Frame Thumbnails
// @namespace    http://tampermonkey.net
// @version      2.1
// @description  Replaces YouTube video thumbnails (home, search, sidebar, watch page, end-screen suggestions) with one of YouTube's own ready-made video frames instead of the uploader's custom thumbnail
// @author       mjb
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

// YouTube pre-renders three frames per video (at roughly 25%, 50% and 75%) and serves
// them unsigned at https://i.ytimg.com/vi/<id>/<variant><n>.jpg, n = 1..3.
// Variants: maxres (1280x720, missing on old/low-res videos), sd (640x480 letterboxed),
// hq (480x360 letterboxed, always present), mq (320x180). No fetching or decoding needed:
// we only swap the <img> src, so this costs the same as loading the original thumbnail.

(function () {
    'use strict';

    const ATTR = 'data-rft-id';      // video id this element currently shows a frame for
    const VARIANTS = ['maxres', 'hq']; // tried in order; hq is the guaranteed fallback
    const VI_RE = /\/vi(?:_webp)?\/([\w-]{11})\//;
    const chosen = new Map();        // videoId -> frame number, stable per page session

    function frameNumber(id) {
        if (!chosen.has(id)) chosen.set(id, 1 + Math.floor(Math.random() * 3));
        return chosen.get(id);
    }

    function frameUrl(id, variant) {
        return `https://i.ytimg.com/vi/${id}/${variant}${frameNumber(id)}.jpg`;
    }

    // ---------- <img> thumbnails ----------

    function videoIdFromImg(img) {
        const m = VI_RE.exec(img.src || '');
        if (m) return m[1];
        const a = img.closest('a[href*="v="]');
        if (a) { try { return new URL(a.href, location.href).searchParams.get('v'); } catch { /* ignore */ } }
        return null;
    }

    function isOurUrl(src) {
        return /\/vi\/[\w-]{11}\/(?:maxres|sd|hq|mq)[123]\.jpg$/.test(src);
    }

    function setFrame(img, id, variantIndex) {
        if (variantIndex >= VARIANTS.length) return;
        const url = frameUrl(id, VARIANTS[variantIndex]);
        img.setAttribute(ATTR, id);
        img.removeAttribute('srcset');
        img.dataset.rftVariant = String(variantIndex);
        img.src = url;
    }

    function onImgError(e) {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || !isOurUrl(img.src)) return;
        const id = img.getAttribute(ATTR);
        if (id) setFrame(img, id, (+img.dataset.rftVariant || 0) + 1);
    }

    function onImgLoad(e) {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || !isOurUrl(img.src)) return;
        // Missing maxres variants come back as a 120x90 placeholder; fall through to hq.
        if (img.naturalWidth && img.naturalWidth <= 120) onImgError(e);
    }

    function processImg(img) {
        if (!(img instanceof HTMLImageElement)) return;
        const src = img.src || '';
        if (isOurUrl(src)) return;
        if (!/i\d?\.ytimg\.com\/vi(?:_webp)?\//.test(src)) return;
        const id = videoIdFromImg(img);
        if (!id) return;
        // Same id re-rendered by YouTube (lazy load, srcset swap) -> re-apply; new id -> new frame.
        setFrame(img, id, 0);
    }

    // ---------- CSS background thumbnails ----------
    // Player poster (.ytp-cued-thumbnail-overlay-image), end-screen suggestion wall
    // (.ytp-videowall-still-image) and in-video cards all use inline background-image.

    const BG_SELECTOR = '[style*="ytimg.com/vi"]';

    function processBg(el) {
        if (!(el instanceof HTMLElement)) return;
        const bg = el.style.backgroundImage || '';
        if (isOurUrl(bg.replace(/^url\(["']?|["']?\)$/g, ''))) return;
        const m = VI_RE.exec(bg);
        if (!m) return;
        el.setAttribute(ATTR, m[1]);
        el.style.backgroundImage = `url("${frameUrl(m[1], 'hq')}")`;
    }

    // ---------- wiring ----------

    function scan(root) {
        if (root instanceof HTMLImageElement) processImg(root);
        else if (root.querySelectorAll) {
            root.querySelectorAll('img').forEach(processImg);
            root.querySelectorAll(BG_SELECTOR).forEach(processBg);
        }
        if (root instanceof HTMLElement) processBg(root);
    }

    document.addEventListener('error', onImgError, true);
    document.addEventListener('load', onImgLoad, true);

    const mo = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === 'attributes') {
                if (m.target instanceof HTMLImageElement) processImg(m.target);
                else processBg(m.target);
            } else {
                m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); });
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });

    scan(document);
    window.addEventListener('yt-navigate-finish', () => scan(document));
})();
