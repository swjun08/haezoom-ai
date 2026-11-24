# Haezoom website design QA

Final status: **passed** for the updated marketing homepage, navigation, and associated frontend preview flows.

## Reference and evidence

- Reference: https://pickle.com/ observed 2026-11-17.
- Local implementation: http://127.0.0.1:4173/
- Reference and implementation screenshots inspected together at 1512 x 693.
- Navigation: 77px height, 993px inner width, 18px links, 48px pill button.
- Hero heading: 56px, weight 590, line-height 1.3. Hero background continues behind translucent navigation; navigation becomes white on scroll.
- Intentional adaptations: Haezoom identity, original generated characters, product copy, Chrome experience and help instead of app stores and language selection.

## Findings resolved

| Finding | Impact | Change | Verification |
|---|---|---|---|
| Navigation and hero typography differed | Different density and hierarchy | Matched measured dimensions, centered copy and translucent navigation | Same-size visual comparison |
| Preview header consumed result space | Important results hidden | Compact iframe styling and expanded view | Text and PDF results visible |
| Global script variable collision | Empty experience page | Scoped website script inside IIFE | Experience cards rendered |
| Mobile hero image clipped | Characters disappeared | Responsive character source and composition | 390 x 844 and 768 x 1024 |
| PDF fixture advertised multiple pages with one result | Misleading preview | One-page fixture | 1/1 with previous/next disabled |

## Validation

- Start menu open/close, overview anchor, mobile menu.
- Preview note entry, save, saved note display, completion and undo.
- Expanded PDF preview, then example task/event results.
- Privacy sub-navigation, help search (match, empty, reset), help-to-experience navigation.
- JavaScript syntax checks passed.
- Local HTML reference check found no missing paths in 21 pages (classroom excluded).
- Final homepage console error list empty.
- No horizontal overflow at 390px; tablet and desktop hero verified visually.
- Focus styles, semantic button names, alternative text and reduced-motion CSS present.

## Screenshot files

- design-evidence/pickle-home-reference.png
- design-evidence/haezoom-home-desktop.png
- design-evidence/haezoom-home-mobile.png
- design-evidence/haezoom-privacy-desktop.png

## Scope and limitations

The marketing preview uses fixed example data and the actual review UI code. Live AI API, Google Calendar and notification delivery were not revalidated in this website pass. The data-handling pages describe implementation behavior and are not a legal compliance certification. The hero uses original generated still artwork with entrance motion, not the reference site's character video. This pass does not claim every Pickle page is a literal clone. Changes are local; no deployment or GitHub push was performed.
