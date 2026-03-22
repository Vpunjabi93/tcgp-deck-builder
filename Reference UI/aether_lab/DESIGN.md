# Design System Document

## 1. Overview & Creative North Star: "The Neon Laboratory"
The Creative North Star for this design system is **"The Neon Laboratory."** This is not a simple deck builder; it is a high-end analytical instrument for elite players. The aesthetic moves away from the flat, "app-store" genericism of traditional mobile tools, instead favoring a futuristic, editorial layout that feels like a high-tech holographic interface.

We achieve this by breaking the standard grid through **intentional layering and depth.** By overlapping card assets over glass containers and using high-contrast typography, we create a sense of tactile premium quality. The UI should feel like a dark, sophisticated environment where the only light sources are the vibrant Pokémon energy types and the data visualizations themselves.

---

## 2. Colors & Surface Logic
The palette is rooted in a deep, nocturnal foundation, allowing the "Energy Type" accents to provide functional wayfinding and emotional "soul."

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning content. To define boundaries, use tonal shifts in the surface hierarchy or vertical whitespace. A container is defined by its background color (`surface-container-low` against `background`), never by a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted glass.
- **Base Layer:** `background` (#0e0e11) – The deep void.
- **Sectioning:** `surface-container-low` (#131316) – Large layout areas.
- **Interactive Containers:** `surface-container` (#19191d) or `surface-container-high` (#1f1f23) – Used for card slots and data modules.
- **Active Selection:** `surface-bright` (#2c2c30) – To indicate a focused state.

### The "Glass & Gradient" Rule
To achieve the "Pocket" premium feel, use Glassmorphism for floating panels (e.g., probability overlays).
- **Glass Token:** Use `surface-container-highest` at 60% opacity with a `24px` backdrop-blur.
- **Signature Accents:** Apply a subtle `0.5px` inner glow (top-down) using the `primary` token at 20% opacity to simulate light hitting the edge of a glass pane.

---

## 3. Typography: Technical Authority
We pair the geometric aggression of **Space Grotesk** with the surgical legibility of **Inter**.

- **Display & Headlines:** Use `Space Grotesk`. This font’s quirky apertures suggest a "tech-forward" and "gamified" personality. Use `display-lg` for win-rate percentages and `headline-md` for Deck Titles.
- **Body & Data:** Use `Inter`. For multi-line text or dense probability tables, Inter provides the necessary neutrality. 
- **The Hierarchy Strategy:** Use extreme scale contrast. A `display-lg` stat should sit next to a `label-sm` unit descriptor to create an editorial, high-end dashboard feel.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are prohibited. Depth is achieved through light and opacity.

- **The Layering Principle:** Instead of shadows, use "stacking." A `surface-container-lowest` card sitting on a `surface-container-low` section creates a natural, recessed "slot" effect.
- **Ambient Glows:** For "floating" elements like a selected Pokémon card, apply an outer glow using the Energy Type color (e.g., Fire Red #FF4422) with a `32px` blur at 15% opacity. This replaces the standard drop shadow with a "light-emitting" effect.
- **The "Ghost Border" Fallback:** If a divider is mandatory for accessibility, use the `outline-variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### High-End Vertical Card Slots
The core of the experience. These are not just image containers; they are interactive modules.
- **Base:** `surface-container-lowest` with a `xl` (0.75rem) border radius.
- **State:** On hover/active, the card should scale (1.05x) and trigger a `primary` (#fcd434) inner glow.
- **No Dividers:** Use `1.5` (0.375rem) spacing to separate card metadata; never use lines.

### Action Buttons
- **Primary:** Use a gradient from `primary` (#fcd434) to `primary-container` (#d8b300). Typography: `label-md` Space Grotesk, All-Caps, Bold.
- **Secondary (Glass):** Semi-transparent `surface-variant` with a backdrop-blur. 
- **Tertiary:** Text-only with `primary` color, used for "cancel" or "back" actions.

### Interactive Gauges & Probability Charts
- **Track:** `surface-container-highest`.
- **Progress:** Use the Energy Type accent color (e.g., Water Blue #4488FF).
- **Glow:** The leading edge of any progress bar must have a 4px glow in the same color to simulate a "laser" filling the gauge.

### Input Fields
- **Container:** `surface-container-low`.
- **Active State:** No border change. Instead, shift the background to `surface-container-highest` and change the label color to `primary`.
- **Error State:** Use `error` (#ff6e84) but apply it only to a 2px bottom-indicator line and the helper text.

---

## 6. Do's and Don'ts

### Do:
- **Use Asymmetry:** Place a large `display-md` probability stat off-center to create visual interest.
- **Embrace Darkness:** Keep 90% of the UI in the `surface` and `background` range to make the "Energy" colors pop.
- **Vertical Rhythm:** Use the `Spacing Scale` (specifically `8` and `12`) to create generous breathing room between data modules.

### Don't:
- **No Solid Outlines:** Never wrap a card or a button in a 100% opaque border.
- **No Pure Greys:** Ensure all dark tones are slightly "cooled" or "warmed" using the provided tokens to avoid a "flat" look.
- **No Standard Icons:** Avoid generic system icons. Use thin-stroke, tech-focused iconography that matches the `Space Grotesk` weight.
- **No "Flat" Buttons:** Every primary action should have a subtle tonal gradient to maintain the "Premium" promise.