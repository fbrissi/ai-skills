# UX/UI checklist

Load this for the viewport pass. Check each screen at desktop and mobile; report only what you can show in a screenshot or reproduce.

## Layout

- No horizontal page scroll at the mobile width (scroll the page sideways or compare document width with the viewport).
- Nothing clipped, cut off, or overlapping: buttons, menus, dialogs, toasts, table cells, long names, long e-mail addresses.
- Aligned columns, labels, and inputs; consistent spacing within a group.
- Dialogs and menus fit the viewport and can be closed on mobile.
- Tables either scroll inside their own container or reflow; the page itself does not scroll sideways.
- Fixed headers, footers, or banners do not hide content or actions.

## Interaction

- Touch targets at least about 44x44 CSS pixels on mobile, with space between adjacent targets.
- Every action reachable by keyboard; visible focus indicator; logical tab order; Escape closes dialogs.
- Forms: labels tied to inputs, errors shown next to the field and announced in text, submit disabled or guarded against double submit.
- Destructive actions ask for confirmation with an action-specific message.

## Content and states

- Readable text contrast (body text roughly 4.5:1 against its background); text not only conveyed by color.
- Loading state while data loads; empty state with guidance; error state with a way to recover.
- Refreshing a detail or edit URL restores the same screen.
- Long or unusual data (very long names, many items, zero items) does not break the layout.
- Images and icons with meaning have text alternatives.

## Health

- No uncaught console errors or failed requests on load or during the flow.
- No request that takes several seconds on the local stack without a loading indicator.

## Evidence

For each finding: a screenshot of the affected area at the viewport where it happens, the viewport size, and the steps to reach the screen.
