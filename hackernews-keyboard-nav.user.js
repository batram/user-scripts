// ==UserScript==
// @name        Hacker News Comment Navigator
// @namespace   Violentmonkey Scripts
// @icon        data:image/svg+xml;base64,PHN2ZyBoZWlnaHQ9IjE4IiB2aWV3Qm94PSI0IDQgMTg4IDE4OCIgd2lkdGg9IjE4IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Im00IDRoMTg4djE4OGgtMTg4eiIgZmlsbD0iI2Y2MCIvPjxwYXRoIGQ9Im03My4yNTIxNzU2IDQ1LjAxIDIyLjc0NzgyNDQgNDcuMzkxMzAwODMgMjIuNzQ3ODI0NC00Ny4zOTEzMDA4M2gxOS41NjU2OTYzMWwtMzQuMzIzNTIwNzEgNjQuNDg2NjE0Njh2NDEuNDkzMzg1MzJoLTE1Ljk4di00MS40OTMzODUzMmwtMzQuMzIzNTIwNzEtNjQuNDg2NjE0Njh6IiBmaWxsPSIjZmZmIi8+PC9zdmc+
// @version     1.1.0
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
    style.textContent = `
        .comtr.hn-nav-highlight,
        .comtr.hn-nav-highlight td {
            background-color: #f0f0e8 !important;
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

    // Clicking a comment selects it.
    comments.forEach((c, index) => {
        c.tr.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            moveTo(index, false);
        });
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
                if (currentIndex === -1) break;

                const current = comments[currentIndex];
                if (toggleComment(current, true)) {
                    // Collapsed it: move on to the next expanded comment at this level or above.
                    const depth = current.indent;
                    const next = findIndex(currentIndex, 1,
                        c => isNavigable(c) && !isCollapsed(c) && c.indent <= depth);
                    // Let HN finish re-rendering the collapse before we scroll.
                    if (next !== -1) setTimeout(() => moveTo(next), 50);
                } else {
                    // Already collapsed: go up to the parent.
                    moveTo(parentIndex(currentIndex));
                }
                break;
            }

            case 'ArrowRight': {
                e.preventDefault();
                if (currentIndex === -1) break;

                const current = comments[currentIndex];
                if (!toggleComment(current, false)) {
                    // Already expanded: step into the first reply, if any.
                    moveTo(firstChildIndex(currentIndex));
                }
                break;
            }
        }
    });
})();
