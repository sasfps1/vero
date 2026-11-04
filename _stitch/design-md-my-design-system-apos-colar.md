---
name: My Design System
colors:
  surface: '#f9f9ff'
  surface-dim: '#d7dae3'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3fc'
  surface-container: '#ebedf7'
  surface-container-high: '#e6e8f1'
  surface-container-highest: '#e0e2eb'
  on-surface: '#181c22'
  on-surface-variant: '#414753'
  inverse-surface: '#2d3037'
  inverse-on-surface: '#eef0fa'
  outline: '#717785'
  outline-variant: '#c1c6d5'
  surface-tint: '#005db8'
  primary: '#005ab4'
  on-primary: '#ffffff'
  primary-container: '#0a73e0'
  on-primary-container: '#fefcff'
  inverse-primary: '#aac7ff'
  secondary: '#465f88'
  on-secondary: '#ffffff'
  secondary-container: '#b6d0ff'
  on-secondary-container: '#3f5881'
  tertiary: '#964400'
  on-tertiary: '#ffffff'
  tertiary-container: '#bd5700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#aac7ff'
  on-primary-fixed: '#001b3e'
  on-primary-fixed-variant: '#00458d'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#aec7f7'
  on-secondary-fixed: '#001b3d'
  on-secondary-fixed-variant: '#2d476f'
  tertiary-fixed: '#ffdbc9'
  tertiary-fixed-dim: '#ffb68c'
  on-tertiary-fixed: '#321200'
  on-tertiary-fixed-variant: '#763400'
  background: '#f9f9ff'
  on-background: '#181c22'
  surface-variant: '#e0e2eb'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
---

# Design System

## Brand & Style
The design system embraces a **Corporate / Modern** aesthetic, prioritizing clarity, trust, and structural balance. The visual language feels reliable, professional, and accessible, ensuring that digital tools remain efficient and clear.

- **Personality:** Professional, dependable, clean, and structured.
- **Tone:** Direct, functional, and user-centric.
- **Visual Motif:** High-fidelity layouts with consistent spacing, crisp typography, and intentional color accents to guide user attention.

## Colors
The color palette is built for a clean light mode environment, leveraging semantic color derivation to ensure high contrast, accessibility, and clear visual hierarchy.

- **Primary (`#1275e2`):** A vibrant, trustworthy blue used for primary actions, active states, and key navigational elements.
- **Secondary (`#5f78a3`):** A muted slate blue providing balanced contrast for supportive UI elements, badges, and secondary actions.
- **Tertiary (`#c55b00`):** A warm amber/orange accent used purposefully for highlights, warnings, or calls to action requiring distinct visual weight.
- **Neutral (`#74777f`):** A versatile cool gray utilized for structural surfaces, borders, typography, and background tones.

## Typography
The typography system relies entirely on **Inter**, a typeface chosen for its exceptional legibility across screen sizes and its clean, modern geometric structure.

- **Headlines:** Set in higher font weights (500–600) to create strong structural hierarchy and orientation.
- **Body:** Optimized for readability at smaller scales with comfortable line heights (1.5x) to reduce eye strain during extended reading.
- **Labels:** Compact, highly legible variants designed for UI controls, form fields, and metadata.

## Layout & Spacing
The layout model uses a standard fluid grid system paired with a predictable spacing scale to maintain consistent rhythm throughout the interface.

- **Grid:** Fluid 12-column grid adapting dynamically across mobile, tablet, and desktop viewports.
- **Spacing Scale:** Built on a modular scale ranging from tight gaps (`space-xs`) for dense UI components to generous section padding (`space-xl`).
- **Breakpoints:** Mobile (<640px), Tablet (640px - 1024px), Desktop (>1024px).

## Elevation & Depth
Elevation is handled primarily through **tonal layers and subtle shadows**, reinforcing the Modern / Corporate aesthetic without adding unnecessary visual noise.

- **Surface Tiers:** Backgrounds and cards use distinct surface shades from the neutral palette to differentiate interactive zones.
- **Shadows:** Soft, diffused shadows provide a mild sense of lift for floating action buttons, modals, and dropdown menus.

## Shapes
The design system applies a **Rounded** shape language (`roundedness: 2`), giving interactive elements a friendly, accessible, and contemporary feel.

- **Base Elements:** Standard UI components (buttons, text inputs, cards) feature a moderate border radius (~0.5rem).
- **Large Containers:** Modals and expanded cards use scaled-up radii (1rem to 1.5rem) to maintain harmonious proportions.

## Components
All components inherit the core design tokens for color, typography, and roundedness to ensure a cohesive experience.

- **Buttons:** Primary buttons feature the primary brand color (`#1275e2`), medium roundedness, and Inter label typography. Secondary buttons use transparent or neutral container fills with subtle borders.
- **Input Fields:** Clear borders using neutral tones, rounded corners, and placeholder text in lighter neutral weights. Focus states highlight the primary blue border.
- **Cards:** Clean surfaces bounded by low-contrast outlines or subtle tonal contrast, utilizing standard padding and rounded corners.
- **Checkboxes & Radios:** Styled using the primary brand color for checked/selected states.
- **Chips & Badges:** Compact capsule-like elements for tagging and filtering, utilizing secondary and tertiary color variations.