---
name: Undertone Wellness
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#20201f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c1c8c6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8b9291'
  outline-variant: '#414847'
  surface-tint: '#accdca'
  primary: '#b8dad7'
  on-primary: '#163534'
  primary-container: '#9dbebb'
  on-primary-container: '#2f4e4c'
  inverse-primary: '#456462'
  secondary: '#96ccff'
  on-secondary: '#003353'
  secondary-container: '#025483'
  on-secondary-container: '#8ec8fe'
  tertiary: '#f9c8ba'
  on-tertiary: '#46291f'
  tertiary-container: '#dbad9f'
  on-tertiary-container: '#614035'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c7e9e6'
  primary-fixed-dim: '#accdca'
  on-primary-fixed: '#00201e'
  on-primary-fixed-variant: '#2d4c4a'
  secondary-fixed: '#cee5ff'
  secondary-fixed-dim: '#96ccff'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#004a75'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ebbcae'
  on-tertiary-fixed: '#2e140c'
  on-tertiary-fixed-variant: '#603f34'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  headline-xl:
    fontFamily: Lexend
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Lexend
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Lexend
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 34px
  headline-md:
    fontFamily: Lexend
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Lexend
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Lexend
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Lexend
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 48px
---

## Brand & Style
The design system is centered on "Soft Progress"—a philosophy that prioritizes the emotional well-being of the user during a GLP-1 weight-loss journey. The brand personality is calm, premium, and supportive, moving away from the high-pressure aesthetics of traditional fitness apps and the sterile coldness of clinical platforms.

The visual style is a blend of **Minimalism** and **Tactile Softness**. By utilizing a dark, warm foundation, the UI reduces eye strain and creates a private, sanctuary-like environment. The experience should feel like a premium lifestyle companion, similar to high-end wearables, focusing on long-term trends rather than daily fluctuations.

## Colors
The palette is rooted in deep, warm neutrals to provide a sophisticated backdrop that feels grounded. 

- **Primary (Sage):** Used for primary actions, progress indicators, and "positive trend" states. It is the core "calm" signal.
- **Secondary (Teal):** Used sparingly for secondary data visualizations or to distinguish between different metric types (e.g., protein vs. hydration).
- **Surface & Background:** A warm off-black (#121212) serves as the canvas, with a slightly lighter surface (#1A1A1A) for cards and containers.
- **Typography:** An off-white/cream (#F5F5F0) is used for high-contrast readability, preventing the harshness of pure white on black.
- **No Clinical Red:** Error states or "low" metrics should be represented by muted ochre or simple neutral shifts; avoid red to prevent medical anxiety.

## Typography
Lexend is chosen for its exceptional readability and friendly, open character. Its slightly expanded widths and rounded terminals evoke an approachable, modern feeling.

- **Headlines:** Use Medium or SemiBold weights to create clear hierarchy without feeling aggressive. 
- **Body:** Regular weight provides a clean, breathable reading experience.
- **Numerical Data:** Large, clear Lexend figures should be used for tracking metrics, ensuring the data feels integrated into the lifestyle aesthetic rather than appearing as a "lab report."

## Layout & Spacing
The layout follows a **Fluid Grid** model with generous safe areas to ensure a sense of "breathing room." 

- **Mobile:** 4-column grid with 24px side margins. Elements should never feel cramped; use vertical stacking with at least 16px (stack-md) between cards.
- **Desktop/Tablet:** 12-column grid centered in a max-width container of 1200px.
- **Rhythm:** Use an 8px base unit. Component internal padding should be generous (typically 20px or 24px) to reinforce the premium, spacious feel.

## Elevation & Depth
Depth is created through **Tonal Layers** and **Ambient Shadows** rather than harsh borders.

- **Surface Levels:** The background is #121212. Interactive cards sit on #1A1A1A.
- **Shadows:** Use extremely soft, large-radius shadows (e.g., `blur: 40px`, `opacity: 0.3`, `color: #000000`) to give cards a subtle "lift" from the background.
- **Glassmorphism:** Use subtle backdrop blurs (10px–20px) for fixed headers or floating navigation bars to maintain a sense of depth and context as the user scrolls.

## Shapes
The shape language is **Highly Rounded (Pill-shaped)**. This eliminates "sharpness" from the UI, reinforcing the non-clinical, supportive nature of the app.

- **Standard Cards:** Use `rounded-xl` (24px on mobile) to create a soft, friendly frame.
- **Buttons & Inputs:** Must be full-pill shapes.
- **Progress Indicators:** Use thick, rounded strokes for circular rings and area charts. Points on charts should be soft-edged circles, never hard vertices.

## Components

- **Pill Buttons:** All primary buttons are high-contrast (Sage background with Dark text) and fully rounded. Secondary buttons use a tonal ghost style (Off-white outline or subtle grey fill).
- **Card-Based Feed:** The home screen is a vertical stack of cards with generous internal padding. Each card focuses on a single "insight" or "trend" to avoid information overload.
- **Progress Rings:** Use thick strokes with rounded end-caps. Use the Sage-to-Teal gradient for multi-stage tracking.
- **Smooth Area Charts:** Data visualizations must use Catmull-Rom or similar smoothing splines. No sharp peaks. Fill the area under the curve with a soft 10% opacity gradient of the Sage accent.
- **Input Fields:** Search and data entry bars are pill-shaped with a #1A1A1A background and no border. Active state is indicated by a subtle Sage glow or soft focus ring.
- **Chips:** Used for filtering "Support" topics or "Track" categories. These should be small pill-shapes with light tonal backgrounds.
- **Iconography:** Use thick-stroke (2pt+), rounded icons. Avoid any medical-specific symbols like crosses, stethoscopes, or sharp needles; use organic shapes like leaves, water drops, or soft heart outlines.