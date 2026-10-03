// ==UserScript==
// @name        Hacker News Comment Navigator
// @namespace   Violentmonkey Scripts
// @icon        data:image/svg+xml;base64,PHN2ZyBoZWlnaHQ9IjE4IiB2aWV3Qm94PSI0IDQgMTg4IDE4OCIgd2lkdGg9IjE4IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Im00IDRoMTg4djE4OGgtMTg4eiIgZmlsbD0iI2Y2MCIvPjxwYXRoIGQ9Im03My4yNTIxNzU2IDQ1LjAxIDIyLjc0NzgyNDQgNDcuMzkxMzAwODMgMjIuNzQ3ODI0NC00Ny4zOTEzMDA4M2gxOS41NjU2OTYzMWwtMzQuMzIzNTIwNzEgNjQuNDg2NjE0Njh2NDEuNDkzMzg1MzJoLTE1Ljk4di00MS40OTMzODUzMmwtMzQuMzIzNTIwNzEtNjQuNDg2NjE0Njh6IiBmaWxsPSIjZmZmIi8+PC9zdmc+
// @version     1.2.2
// @homepageURL https://github.com/batram/user-scripts
// @supportURL  https://github.com/batram/user-scripts/issues
// @updateURL   https://raw.githubusercontent.com/batram/user-scripts/master/hackernews-keyboard-nav.user.js
// @downloadURL https://raw.githubusercontent.com/batram/user-scripts/master/hackernews-keyboard-nav.user.js
//
// @match       https://news.ycombinator.com/item*
// @grant       none
//
// @author      -
// @description  Navigate Hacker News comments with the arrow keys.
//               Down/Up: next/previous comment at the same or a shallower level.
//               Right: expand a collapsed comment, or step into its first reply.
//               Left: collapse an expanded comment and move on to the next
//               expanded one; on a collapsed reply, go to the parent.
//               Touch: swipe a comment right to open it, left to close it.
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Every comment row, in document order, with its nesting depth.
    const comments = Array.from(document.querySelectorAll('.comtr')).map(tr => ({
        tr,
        indent: parseInt(tr.querySelector('.ind')?.getAttribute('indent') ?? '0', 10),
    }));

    if (comments.length === 0) return;

    let currentIndex = -1;

    const style = document.createElement('style');
    // Follow the rendered text color, including Dark Reader and site themes.
    // A translucent tint stays subtle without depending on an extension to
    // rewrite this stylesheet. Paint the full row once so nested cells do not
    // stack translucent backgrounds or leave out the indentation/vote area.
    style.textContent = `
        .comtr.hn-nav-highlight {
            background-color: color-mix(in srgb, currentColor 12%, transparent) !important;
            outline: 1px solid color-mix(in srgb, currentColor 30%, transparent);
            outline-offset: -1px;
        }
    `;
    document.head.appendChild(style);

    // HN hides descendants of a collapsed comment with .noshow (see hn.js hidekids).
    const isHidden = (c) => c.tr.classList.contains('noshow');
    const isCollapsed = (c) => c.tr.classList.contains('coll');
    const isNavigable = (c) => !isHidden(c);

    function highlightComment(index, scroll = true) {
        comments.forEach(c => c.tr.classList.remove('hn-nav-highlight'));

        if (index < 0 || index >= comments.length) return;

        const current = comments[index].tr;
        current.classList.add('hn-nav-highlight');
        if (scroll) current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function moveTo(index, scroll = true) {
        if (index < 0 || index >= comments.length) return false;
        currentIndex = index;
        highlightComment(currentIndex, scroll);
        return true;
    }

    // Search from `from` (exclusive) in direction `step` for the first row matching `pred`.
    function findIndex(from, step, pred) {
        for (let i = from + step; i >= 0 && i < comments.length; i += step) {
            if (pred(comments[i], i)) return i;
        }
        return -1;
    }

    // Next/previous comment that is visible and no deeper than the current one:
    // the next sibling, or, when the siblings run out, the next comment further up the tree.
    function siblingOrAncestorIndex(from, step) {
        const depth = comments[from].indent;
        return findIndex(from, step, c => isNavigable(c) && c.indent <= depth);
    }

    function parentIndex(from) {
        const depth = comments[from].indent;
        return depth === 0 ? -1 : findIndex(from, -1, c => c.indent < depth);
    }

    function firstChildIndex(from) {
        const c = comments[from];
        if (isCollapsed(c)) return -1;
        const next = comments[from + 1];
        return next && next.indent === c.indent + 1 && isNavigable(next) ? from + 1 : -1;
    }

    // Collapse (forceCollapse=true) or expand (false) via HN's own toggle; true if state changed.
    function toggleComment(c, forceCollapse) {
        const toggleBtn = c.tr.querySelector('.togg');
        if (!toggleBtn) return false;

        if (forceCollapse !== isCollapsed(c)) {
            toggleBtn.click();
            return true;
        }
        return false;
    }

    // "Left": collapse the current comment and move on to the next expanded one
    // at this level or above; if it is already collapsed, go up to the parent.
    function collapseCurrent() {
        if (currentIndex === -1) return;
        const current = comments[currentIndex];
        if (toggleComment(current, true)) {
            const depth = current.indent;
            const next = findIndex(currentIndex, 1,
                c => isNavigable(c) && !isCollapsed(c) && c.indent <= depth);
            // Let HN finish re-rendering the collapse before we scroll.
            if (next !== -1) setTimeout(() => moveTo(next), 50);
        } else {
            moveTo(parentIndex(currentIndex));
        }
    }

    // "Right": expand the current comment; if it is already expanded, step into its first reply.
    function expandCurrent() {
        if (currentIndex === -1) return;
        if (!toggleComment(comments[currentIndex], false)) {
            moveTo(firstChildIndex(currentIndex));
        }
    }

    // Clicking a comment selects it.
    comments.forEach((c, index) => {
        c.tr.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            moveTo(index, false);
        });
    });

    // Touch: a horizontal swipe on a comment selects it and acts like Left/Right.
    // Swipe left closes (collapses), swipe right opens (expands).
    const SWIPE_MIN_PX = 50;   // minimum horizontal travel
    const SWIPE_MAX_MS = 600;  // slower than this is a drag, not a swipe
    const SWIPE_SHIFT_MAX = 40; // how far the comment body follows the finger, in px
    let touchStart = null;

    // Swipe indicator: the comment body slides with the finger (capped), and snaps back
    // on release. Transforms on <tr> are unreliable across browsers, so shift the cell.
    const swipeTarget = (c) => c.tr.querySelector('td.default') || c.tr;

    function setSwipeShift(c, dx) {
        const el = swipeTarget(c);
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px)`;
    }

    function clearSwipeShift(c) {
        const el = swipeTarget(c);
        el.style.transition = 'transform 150ms ease-out';
        el.style.transform = '';
    }

    function isSwipe(start, dx, dy) {
        if (Date.now() - start.time > SWIPE_MAX_MS) return false;
        // Mostly horizontal, and far enough to be deliberate.
        return Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * 2;
    }

    comments.forEach((c, index) => {
        c.tr.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) { touchStart = null; return; }
            const t = e.touches[0];
            touchStart = { index, x: t.clientX, y: t.clientY, time: Date.now(), moved: false };
        }, { passive: true });

        c.tr.addEventListener('touchmove', (e) => {
            const start = touchStart;
            if (!start || start.index !== index || e.touches.length !== 1) return;
            const t = e.touches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            // Only start following once the gesture is clearly horizontal.
            if (!start.moved && (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 2)) return;
            start.moved = true;
            // Ease the shift so it feels like resistance and never runs off the screen.
            const shift = Math.sign(dx) * Math.min(Math.abs(dx) / 2, SWIPE_SHIFT_MAX);
            setSwipeShift(c, shift);
        }, { passive: true });

        const finish = (e) => {
            const start = touchStart;
            touchStart = null;
            if (!start || start.index !== index) return;
            if (start.moved) clearSwipeShift(c);
            if (e.type !== 'touchend' || e.changedTouches.length !== 1) return;

            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (!isSwipe(start, dx, dy)) return;

            moveTo(index, false);
            if (dx < 0) collapseCurrent(); else expandCurrent();
        };
        c.tr.addEventListener('touchend', finish, { passive: true });
        c.tr.addEventListener('touchcancel', finish, { passive: true });
    });

    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        switch (e.key) {
            case 'ArrowDown': {
                e.preventDefault();
                if (currentIndex === -1) {
                    moveTo(findIndex(-1, 1, isNavigable));
                } else {
                    moveTo(siblingOrAncestorIndex(currentIndex, 1));
                }
                break;
            }

            case 'ArrowUp': {
                e.preventDefault();
                if (currentIndex !== -1) {
                    moveTo(siblingOrAncestorIndex(currentIndex, -1));
                }
                break;
            }

            case 'ArrowLeft': {
                e.preventDefault();
                collapseCurrent();
                break;
            }

            case 'ArrowRight': {
                e.preventDefault();
                expandCurrent();
                break;
            }
        }
    });
})();
