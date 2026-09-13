# user-scripts

Small userscripts for Tampermonkey / Violentmonkey and friends.

Install by opening the raw `.user.js` file in a browser with a userscript manager installed.

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
