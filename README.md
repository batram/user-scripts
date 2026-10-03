# user-scripts

Small userscripts for Tampermonkey / Violentmonkey and friends.

Install by opening a script's **Install** link below in a browser with a userscript manager
(Violentmonkey, ScriptCat, Tampermonkey, ...) installed.

Every script carries `@updateURL` / `@downloadURL` pointing at its raw file on `master`, so the
manager checks this repo for updates on its normal schedule. An update is picked up only when
`@version` increases, so bump it with every change. Copies installed before these headers existed
(or pasted in by hand) have no update source: reinstall once from the Install link.

| Script | Install |
|---|---|
| YouTube Random Frame Thumbnails | [Install](https://raw.githubusercontent.com/batram/user-scripts/master/youtube-random-frame-thumbnails.user.js) |
| YouTube Kagi Summarize Button | [Install](https://raw.githubusercontent.com/batram/user-scripts/master/youtube-kagi-summarize.user.js) |
| Hacker News Comment Navigator | [Install](https://raw.githubusercontent.com/batram/user-scripts/master/hackernews-keyboard-nav.user.js) |
| TikTok "Not interested" Hotkey | [Install](https://raw.githubusercontent.com/batram/user-scripts/master/tiktok-not-interested-hotkey.user.js) |

## YouTube Random Frame Thumbnails

[`youtube-random-frame-thumbnails.user.js`](youtube-random-frame-thumbnails.user.js)

Replaces the uploader's custom thumbnail with one of the three frames YouTube itself
pre-renders for every video (at roughly 25%, 50% and 75%). Works on the home page, search
results, the watch-page sidebar, the cued player poster and the end-screen suggestion wall.

- No extra network requests beyond the thumbnail itself: the script only rewrites the image
  URL to `maxres{1,2,3}.jpg`, falling back to `hq{1,2,3}.jpg` when no high-res frame exists.
- One frame per video is chosen per page session, so cards stay stable while scrolling.
- Handles lazy-loaded and recycled cards as well as in-page navigation.

## YouTube Kagi Summarize Button

[`youtube-kagi-summarize.user.js`](youtube-kagi-summarize.user.js)

Adds a "Summarize" button on watch pages and in the video "more actions" menus that opens the
video in Kagi's Universal Summarizer.

## Hacker News Comment Navigator

[`hackernews-keyboard-nav.user.js`](hackernews-keyboard-nav.user.js)

Navigate comment threads with the arrow keys: Down/Up move between comments at the same or a
shallower level, Right expands a comment (or steps into its first reply), Left collapses it and
moves on to the next expanded one. Clicking a comment selects it.

On touch screens, swipe a comment right to open it and left to close it.

## TikTok "Not interested" Hotkey

[`tiktok-not-interested-hotkey.user.js`](tiktok-not-interested-hotkey.user.js)

Press `0` on the For You feed to mark the current video as "Not interested". The script opens
the video's "..." menu and clicks the item for you; the key is ignored while typing in a field.
