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
| YouTube Picture-in-Picture Button | [Install](https://raw.githubusercontent.com/batram/user-scripts/master/youtube-pip-button.user.js) |
| YouTube Transcript: Chinese + Pinyin + English | [Install](https://raw.githubusercontent.com/batram/user-scripts/master/youtube-transcript-pinyin.user.js) |

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

## YouTube Picture-in-Picture Button

[`youtube-pip-button.user.js`](youtube-pip-button.user.js)

Adds a picture-in-picture button to the YouTube player, styled like the player's own controls:
next to Theater mode on desktop and in embeds, and in the top row (next to Settings) on
m.youtube.com. Click again, or close the floating window, to return.

- Chrome, Edge, Firefox (version 157 or newer) and Chromium-based apps such as Once's desktop
  app use the standard picture-in-picture API.
- On m.youtube.com the script clears the `disablepictureinpicture` flag YouTube sets on the
  video, and while picture-in-picture is open it hides the tab's "hidden" state from the page,
  so playback continues when you switch apps.
- Older Firefox has picture-in-picture only through its own controls. There the button shows a
  hint with the shortcut (`Ctrl+Shift+]`) instead.
- Gecko on Android (Firefox, Once's Android app) has no page API, but the app enters native
  picture-in-picture when a fullscreen video is playing and you go to the home screen. There
  the button puts the player in fullscreen, starts playback and tells you to press Home.
- If Once's native bridge announces itself after the page loaded (`once-pip-ready`), the
  script re-evaluates and switches to the standard API.

## YouTube Transcript: Chinese + Pinyin + English

[`youtube-transcript-pinyin.user.js`](youtube-transcript-pinyin.user.js)

For learning Chinese from videos with Chinese captions: the watch page's transcript panel
("Show transcript") shows every caption cue as Chinese, pinyin and English together. YouTube
groups several cues into one paragraph per row; the script splits those back into the
individual subtitle lines, each with its own timestamp. Clicking a cue seeks to exactly that
line, and the cue being spoken is highlighted as the video plays.

- Chips at the top of the panel hide or show each of the three lines (hide English to test
  yourself); the choice is remembered.
- English comes from the video's own English captions when it has them, otherwise from
  YouTube's automatic translation of the Chinese track.
- Pinyin is generated in the browser with [pinyin-pro](https://github.com/zh-lx/pinyin-pro)
  (loaded once from jsDelivr); context-aware for most multi-reading characters.
- Videos without a Chinese caption track are left alone.
- Captions are fetched the way the player does it (its request token and visitor id), so no
  extra login or API key is needed. If the player has not loaded captions yet when the panel
  opens, the script turns them on for a moment and back off again.
