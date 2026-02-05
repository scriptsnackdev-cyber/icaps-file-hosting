# ICAPS Cloud Project Specification & Architecture

This document outlines the project structure and coding standards for the ICAPS Cloud File Hosting platform.

## 📁 Directory Structure (src/)

To ensure scalability and maintainability, the project follows a feature-based folder structure:

| Folder | Description |
| :--- | :--- |
| `actions/` | Next.js Server Actions for handling data mutations. |
| `app/` | App Router directory (Routes, Layouts, APIs). |
| `components/` | Reusable UI and layout components. |
| `- ui/` | Reusable, atomic UI components (Buttons, Inputs, Modals). |
| `- layout/` | Structural components (Sidebar, SidebarItem, Header). |
| `features/` | Domain-specific components, hooks, and logic grouped by feature (Drive, Admin, Auth). |
| `constants/` | Constant values, configuration, and enums. |
| `contexts/` | React Context providers for global state management. |
| `hooks/` | Custom Reach hooks for shared logic. |
| `lib/` | Initialization of external libraries / SDKs (Supabase, S3). |
| `services/` | Logic for external API calls and database interactions. |
| `types/` | TypeScript type definitions and interfaces. |
| `utils/` | General-purpose helper functions. |

## 🛠️ Technology Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS + Vanilla CSS (globals.css)
- **Database**: Supabase (PostgreSQL + Auth)
- **Storage**: Cloudflare R2 (S3-compatible)
- **State Management**: React Context / Server State (Action Cache)
- **Icons**: Lucide React
- **Typography**: Inter / Sans-serif (Body), Poppins (Headlines)

## 🎨 Design System (ICAPS Theme)

- **Primary Color**: `#2563EB` (Blue 600)
- **Secondary Color**: `#64748B` (Slate 500)
- **Aesthetic**: Modern Clean Enterprise UI with subtle shadows and rounded corners (2xl).

## 🚀 Development Guidelines

1. **Component Pattern**: Use Functional Components with `use client` or `use server` as needed.
2. **Naming Convention**:
   - Files: `PascalCase.tsx` for components, `camelCase.ts` for logic.
   - Folders: `kebab-case`.
3. **Absolute Imports**: Always use `@/` alias for cleaner paths.
4. **Environment Variables**: Never hardcode secrets. Use `.env.local` and `NEXT_PUBLIC_` prefix for client-accessible variables.
5. **Types**: Avoid `any`. Define interfaces in `src/types/` for entities like `Character`, `Profile`, etc.

## 📱 Responsive Design Guidelines

### Mobile-First Approach
PurrPaw is designed to work seamlessly across all devices. Follow these principles:

1. **Breakpoints** (Tailwind CSS):
   - Mobile: default (< 768px)
   - Tablet: `md:` (768px+)
   - Desktop: `lg:` (1024px+)
   - Large Desktop: `xl:` (1280px+)

2. **Sidebar Behavior**:
   - Mobile: Hidden by default, toggleable via hamburger menu (left side of topbar)
   - Tablet/Desktop: Always visible, sticky positioning
   - Implement overlay backdrop on mobile when sidebar is open

3. **Layout Spacing**:
   - Mobile: `px-4 py-4`
   - Desktop: `px-8 py-6`
   - Use responsive utilities: `gap-3 md:gap-4`

4. **Grid Systems**:
   - Character cards: Use CSS columns for masonry layout
   - Mobile: `columns-2`
   - Tablet: `columns-3`
   - Desktop: `columns-4`
   - Large: `columns-5`

5. **Interactive Elements**:
   - Touch targets minimum 44x44px on mobile
   - Hover states disabled on touch devices
   - Buttons should have active states for visual feedback

6. **Navigation**:
   - Mobile: Hamburger menu on the left side of topbar
   - Sticky headers and navigation bars
   - Search bar should be responsive and full-width on mobile

7. **Bottom Navigation Bar (Mobile Only)**:
   - Fixed bottom navigation with 5 items: Home, Search, Create (center FAB), Chat, Profile
   - Center button is a floating action button (FAB) elevated above the bar
   - z-index hierarchy: BottomNav (30) < Overlay (40) < Sidebar/Modals (50+)
   - Content area must have bottom padding (`pb-20 md:pb-0`) to avoid overlap
   - Includes safe-area-inset for devices with notches/home indicators

8. **Z-Index Hierarchy**:
   - Base content: 0-10
   - Topbar/Header: 10
   - Bottom Navigation: 30
   - Mobile Overlay (backdrop): 40
   - Sidebar (mobile): 50
   - Modals & Confirmations: 100+

## ⚡ Performance & UX Guidelines

To ensure a smooth, premium experience, all features must adhere to these performance standards:

1.  **Lazy Loading & Suspense**:
    - Use `next/dynamic` for all heavy components (Charts, Grids, Modals).
    - Heavy UI sections must use `Suspense` with a Skeleton fallback.
    - **Never** block the entire page load for secondary content.

2.  **Optimistic UI Usage**:
    - "Smooth updates without refresh": All user actions (Like, Subscribe, Save) must reflect instantly in the UI.
    - Use `useOptimistic` (if applicable) or manual state updates before awaiting API responses.
    - Revert state only if the API call fails.

3.  **Loading States**:
    - **BANNED**: Full-page generic loading spinners.
    - **REQUIRED**: Context-aware Skeleton screens (Shimmer effects) that match the layout of the loading content.
    - Keep Sidebar and Header visible/interactive while page content loads.
