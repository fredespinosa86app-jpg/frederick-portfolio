# Known issues (open items, to be fixed in a later phase)

## KI-1 Toolkit still appears after "Show the Toolkit section" is unchecked (reported after E1, 2026-11-04)
- **Reported:** the How I Work switch works; with the Toolkit switch unchecked and saved, "Toolkit" still appears on the public page.
- **Status:** OPEN. Not fixed in E1, E2 or E3 on purpose (owner asked to defer).
- **Tested in the build environment:** both switches hide the standalone sections and their menu links (cached and live, 40 E1 checks). So the cause is not yet reproduced.
- **To check first when fixed:**
  1. Is the "Toolkit" the owner sees the standalone section (`#toolkit`) or the Toolkit list inside a Training category? The Training lists are intentionally NOT affected by the switch.
  2. Was the change saved (Save sections) and is `settings/site.sections.toolkit` `false` in the database?
  3. Is an older cached copy of the page or scripts being served (hard refresh, version tag)?
  4. Another script re-showing `#toolkit` (content.js re-renders the Toolkit rows; section-bg.js) or the menu link in another place.
- **Do not ship a change for this until the cause is reproduced and a test is added.**
