# Small Worlds

The hub for **websites.nathanhubbard.me** — a small, cinematic gallery of the
interactive web experiments Nathan Hubbard builds (in conversation with Claude).

Each project is presented as a *living miniature*: the previews aren't
screenshots, they're animated CSS/Canvas dioramas that hint at the world behind
the link.

| # | World | Link |
|---|-------|------|
| 01 | Ocean — water & light | https://ocean.websites.nathanhubbard.me |
| 02 | Train — a window-seat journey | https://train.websites.nathanhubbard.me |
| 03 | Vela — neon District 7 | https://vela.websites.nathanhubbard.me |

## Stack

Pure static site. No build step, no dependencies.

- `index.html` — structure & copy
- `styles.css` — the dioramas, typography, theming
- `main.js` — custom cursor, constellation intro, scroll theming, parallax

Just open `index.html` or serve the folder statically.

## Adding a world

1. Duplicate a `<section class="world">` block in `index.html`, bump the number,
   swap the copy, host, and diorama markup.
2. Add a matching diorama style block in `styles.css`.
3. Register its accent palette in the `THEMES` map in `main.js` and add a
   `<a>` to the spine index.

## Preview tool

`tools/shot.mjs` renders each section to PNG via Playwright for a quick visual
check. Generated `shot-*.png` files are gitignored.

---

Inquiries: **contact@nathanhubbard.me**
