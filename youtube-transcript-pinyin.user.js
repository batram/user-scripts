// ==UserScript==
// @name         YouTube Transcript: Chinese + Pinyin + English
// @namespace    http://tampermonkey.net
// @version      1.1
// @homepageURL  https://github.com/batram/user-scripts
// @supportURL   https://github.com/batram/user-scripts/issues
// @updateURL    https://raw.githubusercontent.com/batram/user-scripts/master/youtube-transcript-pinyin.user.js
// @downloadURL  https://raw.githubusercontent.com/batram/user-scripts/master/youtube-transcript-pinyin.user.js
// @description  Shows every line of a Chinese video's transcript panel as Chinese, pinyin and English for language learning
// @author       batram
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/pinyin-pro@3.26.0/dist/index.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;

    const TAG = '[yt3l]';
    const STORE_KEY = 'yt3l-lines';

    // ---------------------------------------------------------------------
    // Caption data
    //
    // YouTube's /api/timedtext only answers requests that carry the player's
    // "pot" token and the visitor-id header the player sends with it; the
    // plain baseUrl from the player response comes back empty. The player's
    // own caption request has the token, and the token and signature don't
    // cover the lang/tlang/fmt parameters, so that URL is reused for the
    // Chinese track, the English track (or an automatic translation when the
    // video has no English captions) and json3 output.
    // ---------------------------------------------------------------------
    let potUrl = null;        // last timedtext URL the player requested, with pot
    let potVideoId = null;
    let data = null;          // { videoId, zh: [events], en: [events] }
    let loading = null;       // Promise while a fetch is in flight
    let failedFor = null;     // videoId that failed, don't hammer the API
    let nudgeAt = 0;

    const OWN = 'yt3l=1';   // marks this script's own fetches, so they aren't captured as the player's
    function noteResource(name) {
        if (!name.includes('/api/timedtext') || !name.includes('pot=') || name.includes(OWN)) return;
        try {
            const u = new URL(name);
            potUrl = u;
            potVideoId = u.searchParams.get('v');
        } catch (e) { /* ignore */ }
    }

    try {
        // YouTube fills the default 250-entry buffer in seconds
        performance.setResourceTimingBufferSize(3000);
        performance.getEntriesByType('resource').forEach((e) => noteResource(e.name));
        new PerformanceObserver((list) => list.getEntries().forEach((e) => noteResource(e.name)))
            .observe({ type: 'resource', buffered: true });
    } catch (e) {
        console.warn(TAG, 'PerformanceObserver unavailable', e);
    }

    function player() {
        return document.getElementById('movie_player');
    }

    function currentVideoId() {
        const p = player();
        const fromPlayer = p && p.getVideoData && p.getVideoData();
        return (fromPlayer && fromPlayer.video_id) || new URLSearchParams(location.search).get('v');
    }

    function captionTracks() {
        const p = player();
        const pr = p && p.getPlayerResponse && p.getPlayerResponse();
        const list = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
        return (list && list.captionTracks) || [];
    }

    function pickTracks() {
        const tracks = captionTracks();
        const zh = tracks.find((t) => /^zh/i.test(t.languageCode) && t.kind !== 'asr')
            || tracks.find((t) => /^zh/i.test(t.languageCode));
        if (!zh) return null;
        const en = tracks.find((t) => /^en/i.test(t.languageCode) && t.kind !== 'asr')
            || tracks.find((t) => /^en/i.test(t.languageCode));
        return { zh, en };
    }

    // Make the player request its captions, so a pot URL shows up. First by
    // selecting the Chinese track; if the player already had it loaded (so
    // nothing was fetched), by asking for a translation of it, which it has
    // to fetch. Captions state is put back the way it was afterwards. An
    // unstarted or cued player fetches nothing, so those don't count as tries.
    const NUDGES = 6;
    const nudges = {};   // videoId -> attempts
    function nudgePlayer(zh) {
        const p = player();
        const id = currentVideoId();
        if (!p || !p.loadModule || !id || (nudges[id] || 0) >= NUDGES) return;
        const state = p.getPlayerState ? p.getPlayerState() : 1;
        if (state === -1 || state === 5) return;
        const attempt = nudges[id] = (nudges[id] || 0) + 1;
        let before = null;
        try { before = p.getOption('captions', 'track'); } catch (e) { /* module not loaded */ }
        const hadTrack = !!(before && before.languageCode);
        const track = { languageCode: zh.languageCode, kind: zh.kind || '' };
        if (attempt % 2 === 0) track.translationLanguage = { languageCode: 'en' };
        console.log(TAG, `asking the player for captions (attempt ${attempt})`);
        try {
            p.loadModule('captions');
            p.setOption('captions', 'track', track);
        } catch (e) {
            console.warn(TAG, 'could not load captions', e);
            return;
        }
        setTimeout(() => {
            try {
                if (hadTrack) {
                    if (track.translationLanguage) p.setOption('captions', 'track', before);
                } else {
                    p.setOption('captions', 'track', {});
                    p.unloadModule('captions');
                }
            } catch (e) { /* ignore */ }
        }, 1500);
    }

    function trackUrl(base, track, tlang) {
        const u = new URL(base.toString());
        u.searchParams.set('fmt', 'json3');
        u.searchParams.delete('tlang');
        u.searchParams.delete('name');
        u.searchParams.set('lang', track.languageCode);
        if (track.kind) u.searchParams.set('kind', track.kind); else u.searchParams.delete('kind');
        if (tlang) u.searchParams.set('tlang', tlang);
        u.searchParams.set('yt3l', '1');
        return u.toString();
    }

    function apiHeaders() {
        const cfg = (window.yt && window.yt.config_) || {};
        const h = {};
        if (cfg.EOM_VISITOR_DATA) h['x-goog-eom-visitor-id'] = cfg.EOM_VISITOR_DATA;
        if (cfg.VISITOR_DATA) h['x-goog-visitor-id'] = cfg.VISITOR_DATA;
        h['x-youtube-client-name'] = String(cfg.INNERTUBE_CONTEXT_CLIENT_NAME || 1);
        const ver = cfg.INNERTUBE_CONTEXT_CLIENT_VERSION || cfg.INNERTUBE_CLIENT_VERSION;
        if (ver) h['x-youtube-client-version'] = ver;
        return h;
    }

    function parseEvents(json) {
        const out = [];
        for (const ev of json.events || []) {
            if (!ev.segs || ev.aAppend) continue;
            const text = ev.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            out.push({ start: ev.tStartMs / 1000, end: (ev.tStartMs + (ev.dDurationMs || 0)) / 1000, text });
        }
        return out;
    }

    async function fetchEvents(url) {
        const r = await fetch(url, { credentials: 'same-origin', headers: apiHeaders() });
        const text = await r.text();
        if (!r.ok || !text) throw new Error(`timedtext ${r.status}, ${text.length} bytes`);
        return parseEvents(JSON.parse(text));
    }

    async function load() {
        const videoId = currentVideoId();
        if (!videoId || failedFor === videoId) return null;
        if (data && data.videoId === videoId) return data;
        if (loading) return loading;

        const tracks = pickTracks();
        if (!tracks) return null;             // not a Chinese video
        if (!potUrl || potVideoId !== videoId) {
            // give a nudge 3s to produce a request before the next one
            if (!nudgeAt || Date.now() - nudgeAt > 3000) {
                nudgeAt = Date.now();
                nudgePlayer(tracks.zh);
            }
            return null;                      // try again on the next tick
        }

        loading = (async () => {
            try {
                const [zh, en] = await Promise.all([
                    fetchEvents(trackUrl(potUrl, tracks.zh)),
                    tracks.en
                        ? fetchEvents(trackUrl(potUrl, tracks.en))
                        : fetchEvents(trackUrl(potUrl, tracks.zh, 'en')),
                ]);
                data = { videoId, zh, en };
                console.log(TAG, `loaded ${zh.length} zh / ${en.length} en lines`,
                    tracks.en ? '(english track)' : '(auto-translated)');
                return data;
            } catch (e) {
                console.warn(TAG, 'caption fetch failed', e);
                failedFor = videoId;
                return null;
            } finally {
                loading = null;
            }
        })();
        return loading;
    }

    // ---------------------------------------------------------------------
    // Transcript panel rows (new view-model markup and the older Polymer one)
    // ---------------------------------------------------------------------
    const ROW = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
    const TIME = '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp';
    const TEXT = 'span.ytAttributedStringHost, .segment-text';

    function parseTime(text) {
        const parts = text.trim().split(':').map(Number);
        if (parts.some(isNaN)) return NaN;
        return parts.reduce((acc, n) => acc * 60 + n, 0);
    }

    function eventsBetween(events, from, to) {
        const out = [];
        for (const ev of events) {
            if (ev.start < from - 0.5) continue;
            if (ev.start >= to - 0.5) break;
            out.push(ev);
        }
        return out;
    }

    // One cue per Chinese caption line, with the English lines whose start is
    // closest to it. A translated track has the same timings, so that is 1:1;
    // a human English track is timed on its own, so this is a best effort.
    function cuesBetween(info, from, to) {
        const zh = eventsBetween(info.zh, from, to);
        const en = eventsBetween(info.en, from, to);
        const cues = zh.map((ev) => ({ start: ev.start, end: ev.end, zh: ev.text, en: [] }));
        if (!cues.length) {
            if (!en.length) return [];
            return [{ start: en[0].start, end: en[en.length - 1].end, zh: '', en: en.map((e) => e.text) }];
        }
        for (const ev of en) {
            let best = 0;
            for (let i = 1; i < cues.length; i++) {
                if (Math.abs(cues[i].start - ev.start) < Math.abs(cues[best].start - ev.start)) best = i;
            }
            cues[best].en.push(ev.text);
        }
        return cues;
    }

    function fmtTime(s) {
        s = Math.max(0, Math.floor(s));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        const mm = h ? String(m).padStart(2, '0') : String(m);
        return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
    }

    function toPinyin(zh) {
        try {
            return window.pinyinPro.pinyin(zh, { nonZh: 'consecutive' });
        } catch (e) {
            console.warn(TAG, 'pinyin failed', e);
            return '';
        }
    }

    function line(cls, text) {
        const div = document.createElement('div');
        div.className = 'yt3l-line ' + cls;
        div.textContent = text;
        return div;
    }

    function cueNode(cue) {
        const node = document.createElement('div');
        node.className = 'yt3l-cue';
        node.dataset.start = cue.start;
        node.dataset.end = cue.end;
        const time = document.createElement('div');
        time.className = 'yt3l-time';
        time.textContent = fmtTime(cue.start);
        const lines = document.createElement('div');
        lines.className = 'yt3l-lines';
        lines.append(
            line('yt3l-zh', cue.zh),
            line('yt3l-py', cue.zh ? toPinyin(cue.zh) : ''),
            line('yt3l-en', cue.en.join(' ')),
        );
        node.append(time, lines);
        node.addEventListener('click', (e) => {
            // seek to this cue rather than to the start of YouTube's row
            e.stopPropagation();
            e.preventDefault();
            const p = player();
            if (p && p.seekTo) p.seekTo(cue.start, true);
        });
        return node;
    }

    function decorate(rows, info) {
        const starts = rows.map((r) => {
            const t = r.querySelector(TIME);
            return t ? parseTime(t.textContent) : NaN;
        });
        rows.forEach((row, i) => {
            const from = starts[i];
            if (isNaN(from)) return;
            let to = Infinity;
            for (let j = i + 1; j < starts.length; j++) {
                if (!isNaN(starts[j])) { to = starts[j]; break; }
            }
            // State lives on the inserted box: YouTube rewrites the row's own
            // attributes (class, style) whenever the active segment changes.
            const key = `${info.videoId}:${from}:${to}`;
            let box = row.querySelector('.yt3l-box');
            if (box && box.dataset.key === key) return;

            const cues = cuesBetween(info, from, to);
            if (!cues.length) {
                if (box) box.remove();
                return;
            }
            if (!box) {
                box = document.createElement('div');
                box.className = 'yt3l-box';
                const text = row.querySelector(TEXT);
                if (text && text.parentNode) text.parentNode.insertBefore(box, text.nextSibling);
                else row.appendChild(box);
            }
            box.dataset.key = key;
            box.replaceChildren(...cues.map(cueNode));
        });
        highlight();
    }

    // ---------------------------------------------------------------------
    // Highlight the cue being spoken (YouTube only highlights its whole row)
    // ---------------------------------------------------------------------
    let activeCue = null;
    function highlight() {
        const video = document.querySelector('#movie_player video, video.html5-main-video');
        if (!video) return;
        const t = video.currentTime;
        let next = null;
        for (const cue of document.querySelectorAll('.yt3l-cue')) {
            const start = Number(cue.dataset.start), end = Number(cue.dataset.end);
            if (t >= start - 0.1 && (t < end || t < start + 0.5)) { next = cue; break; }
            if (start > t) break;
        }
        if (next === activeCue) return;
        if (activeCue) activeCue.classList.remove('yt3l-active');
        activeCue = next;
        if (next) next.classList.add('yt3l-active');
    }
    // timeupdate doesn't bubble; capture on the document catches every video element
    document.addEventListener('timeupdate', (e) => {
        if (e.target && e.target.tagName === 'VIDEO' && document.querySelector('.yt3l-cue')) highlight();
    }, true);

    // ---------------------------------------------------------------------
    // Line toggles in the panel header (hide English to test yourself, ...)
    // ---------------------------------------------------------------------
    const LINES = [['zh', '中文'], ['py', 'pīnyīn'], ['en', 'English']];
    let shown = { zh: true, py: true, en: true };
    try { Object.assign(shown, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* ignore */ }

    function applyShown() {
        LINES.forEach(([k]) => document.documentElement.classList.toggle('yt3l-hide-' + k, !shown[k]));
        document.querySelectorAll('.yt3l-toggle').forEach((b) => {
            b.setAttribute('aria-pressed', String(!!shown[b.dataset.line]));
        });
    }

    function addToggles(row) {
        const panel = row.closest('ytd-engagement-panel-section-list-renderer');
        if (!panel || panel.querySelector('.yt3l-toggles')) return;
        const header = panel.querySelector('#header');
        if (!header) return;
        const bar = document.createElement('div');
        bar.className = 'yt3l-toggles';
        LINES.forEach(([k, label]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'yt3l-toggle';
            b.dataset.line = k;
            b.textContent = label;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                shown[k] = !shown[k];
                try { localStorage.setItem(STORE_KEY, JSON.stringify(shown)); } catch (err) { /* ignore */ }
                applyShown();
            });
            bar.appendChild(b);
        });
        header.appendChild(bar);
        applyShown();
    }

    function addStyle() {
        if (document.getElementById('yt3l-style')) return;
        const style = document.createElement('style');
        style.id = 'yt3l-style';
        style.textContent = `
            transcript-segment-view-model:has(> .yt3l-box) > span.ytAttributedStringHost,
            ytd-transcript-segment-renderer:has(.yt3l-box) .segment-text { display: none !important; }
            /* each cue carries its own time; YouTube's row timestamp would be a third copy */
            transcript-segment-view-model:has(> .yt3l-box) > .ytwTranscriptSegmentViewModelTimestamp,
            ytd-transcript-segment-renderer:has(.yt3l-box) .segment-timestamp { display: none !important; }
            .yt3l-box { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
            .yt3l-cue {
                display: flex; gap: 8px; align-items: flex-start; padding: 4px 6px; margin: 0 -6px;
                border-radius: 6px; cursor: pointer;
            }
            .yt3l-cue:hover { background: var(--yt-spec-10-percent-layer, rgba(0,0,0,.06)); }
            .yt3l-cue.yt3l-active { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,.08)); }
            .yt3l-time {
                flex: none; min-width: 3.6em; margin-top: 3px; text-align: right;
                font: 500 1.1rem/1.5 "YouTube Noto", Roboto, Arial, sans-serif;
                color: var(--yt-spec-text-secondary, #606060); font-variant-numeric: tabular-nums;
            }
            .yt3l-lines { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
            .yt3l-line { white-space: normal; word-break: break-word; }
            .yt3l-line:empty { display: none; }
            .yt3l-zh { font-size: 1.7rem; line-height: 1.4; letter-spacing: .04em; }
            .yt3l-py { font-size: 1.25rem; line-height: 1.35; color: var(--yt-spec-text-secondary, #606060); }
            .yt3l-en { font-size: 1.3rem; line-height: 1.4; color: var(--yt-spec-text-primary, #0f0f0f); opacity: .85; }
            .yt3l-hide-zh .yt3l-zh, .yt3l-hide-py .yt3l-py, .yt3l-hide-en .yt3l-en { display: none; }
            .yt3l-toggles { display: flex; gap: 6px; padding: 0 16px 8px; }
            .yt3l-toggle {
                font: 500 1.2rem/1 "YouTube Noto", Roboto, Arial, sans-serif; cursor: pointer;
                padding: 6px 10px; border-radius: 16px; border: 1px solid var(--yt-spec-10-percent-layer, #ddd);
                background: transparent; color: var(--yt-spec-text-secondary, #606060);
            }
            .yt3l-toggle[aria-pressed="true"] {
                background: var(--yt-spec-badge-chip-background, #f2f2f2);
                color: var(--yt-spec-text-primary, #0f0f0f);
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // ---------------------------------------------------------------------
    // Drive it from DOM changes (panel opens, rows render, SPA navigation)
    // ---------------------------------------------------------------------
    let queued = false;
    let retryTimer = 0;
    async function tick() {
        queued = false;
        const rows = [...document.querySelectorAll(ROW)];
        if (!rows.length) return;
        addStyle();
        const info = await load();
        if (!info) {
            // Waiting for the player's caption request or for the player itself
            if (failedFor !== currentVideoId() && pickTracks()) {
                clearTimeout(retryTimer);
                retryTimer = setTimeout(schedule, 700);
            }
            return;
        }
        addToggles(rows[0]);
        decorate(rows, info);
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
