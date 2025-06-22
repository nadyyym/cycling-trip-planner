# Unified UI & Navigation Research

> Goal: Provide a consistent, lightweight navigation experience across all major pages (`/`, `/explore`, `/new-trip`, `/trip/*`) with a shared header and a map-friendly, floating sidebar. This document summarises design research, best-practice patterns, and concrete recommendations for implementation.

---

## 1  Navigation Patterns in Map-Centric Apps

| Pattern | Pros | Cons | Real-world Examples |
|---------|------|------|---------------------|
| **Top App-Bar + Left Floating Sidebar** | • Keeps global nav (logo, page links, profile) in familiar position.<br/>• Sidebar can overlay map without shrinking viewport.<br/>• Works well on wide screens; can auto-collapse on small screens. | • Requires careful z-index & padding so map gestures still work.<br/>• Needs accessibility handling for overlay focus trapping. | Google My Maps, Mapbox Studio |
| **Collapsible Drawer** | • Saves space; opens only on demand.<br/>• Mobile-friendly via swipe gesture. | • Extra click to view nav; discoverability issues.<br/>• Harder to compare pages at a glance. | Strava Route Builder |
| **Persistent Tabs Below Header** | • Very light footprint; instant switching.<br/>• Great for <6 sections. | • Tabs don't scale; poor for deep navigation.<br/>• Consumes vertical space on small screens. | Komoot Route Planner |

**Recommendation ➜** _Top App-Bar (header) + Floating Sidebar._ This matches stated preference and maximises map area while preserving always-visible nav.

---

## 2  Information Architecture

1. **Global Header (48-56 px)**
   • Logo ➔ `/`
   • Primary links: Explore, New Trip, My Trips (or Dashboard)
   • User avatar + dropdown (settings, sign out)

2. **Contextual Sidebar**
   • Shows page-specific lists (e.g., search results, trip days)
   • Position: `position: fixed; top: headerHeight + 8px; left: 8px; width: 280px; max-height: calc(100vh - headerHeight - 16px); overflow-y: auto;`
   • Elevation: subtle shadow `box-shadow: 0 2px 8px rgba(0,0,0,.08)`
   • Close/collapse button for mobile (< md breakpoint).

3. **Main Content Region**
   • Fills remaining viewport; often a map component.

---

## 3  UI Library & Styling Strategy

- **Tailwind CSS** already present ➜ extend via component classes (`@apply`).
- Add **`@headlessui/react`** for accessible primitives (Disclosure, Dialog for sidebar).
- **Shadcn/ui** components in codebase ➜ re-use `Button`, `Dialog`, `Tabs`.

Accessibility:
- Ensure `header` has `role="banner"`.
- Sidebar uses `aside` with `aria-labelledby`.
- Focus trapping when sidebar is modal on mobile.

---

## 4  Next.js – Shared Layout Implementation

1. **Create `/src/app/(dashboard)/layout.tsx`**
   ```tsx
   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           <Header />
           {children}
         </body>
       </html>
     );
   }
   ```
   - Place `Header` component in `src/app/_components/Header.tsx`.
   - Pages `/explore`, `/new-trip`, `/trip/[slug]` reside under `(dashboard)` folder so they inherit the layout.

2. **FloatingSidebar Provider**
   - Use React Context to expose `openSidebar(content)`.
   - Each page supplies its own sidebar component via context.

---

## 5  Responsive Behaviour

| Breakpoint | Header | Sidebar | Map |
|------------|--------|---------|-----|
| `≥ md` | Fixed top | Fixed left, 280 px | `margin-left: 280px`, full height |
| `< md` | Fixed top | Off-canvas (Slide-in) | Full-screen; sidebar overlays map |

---

## 6  Performance Considerations

- Keep header static; avoid client-side state except auth user.
- Lazy-load sidebar heavy components (e.g., trip analytics).
- Memoise map renders; sidebar state shouldn't re-create map.

---

## 7  Styling Tokens

```
:root {
  --header-height: 56px;
  --sidebar-width: 280px;
  --z-header: 40;
  --z-sidebar: 30;
}
```
Add these to `globals.css` for easy tweaks.

---

## 8  Deployment Ready Checklist

- [ ] Header links route correctly via `next/link`.
- [ ] Sidebar toggles with `S` key (accessibility shortcut).
- [ ] All interactive elements reachable via keyboard.
- [ ] Lighthouse nav-consistency score ≥ 95.

---

## 9  Future Enhancements

1. User-customisable sidebar width (store in localStorage).
2. Dark-mode aware header/sidebar.
3. Progressive Web App installability banner in header.

---

### References
- Material Design Navigation Rail: https://m3.material.io/components/navigation-rail/overview
- Headless UI – Dialog: https://headlessui.com/react/dialog
- Mapbox Best Practices for Overlay UI: https://docs.mapbox.com/help/glossary/ui-overlays/
- Next.js Nested Layouts: https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts