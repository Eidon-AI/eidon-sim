# Eidon Sym · Code & Style Guide

A shared reference to keep the codebase readable, consistent, and easy to review. Follow these conventions for all new PRs. (When in doubt, match adjacent code.)

---

## 1  TypeScript

### 1.1  Strictness & Compiler Flags

* `"strict": true` — no `any`, no implicit `this`, no unchecked null.
* Prefer explicit return types on exported functions.
* Ambient browser types (`DOM`) are available; no `@ts-ignore` unless unavoidable.

### 1.2  Naming

* `PascalCase` for classes & React components.
* `camelCase` for functions, variables, object keys.
* `UPPER_SNAKE` for constants exported from `core/constants.ts`.
* Filenames mirror default export: `ArmSolver.ts` → `class ArmSolver`.

### 1.3  Imports

* Absolute from `src/` using Vite base alias.
* Group order: builtin → external → internal.
* Multiline if > 80 chars.

```ts
import { quat } from 'gl-matrix';
import { create } from 'zustand';
import { DeviceState } from '@/core/types';
```

---

## 2  React / Preact (future‑proof rules)

* Functional components only, wrapped in `memo` when props rarely change.
* Hooks order: `useState`, `useEffect`, `useMemo`, custom hooks.
* Props interface at top of file; default values via destructuring.
* No inline anonymous functions inside `render` for frequently firing events.

---

## 3  Three.js

* One WebGLRenderer and one global scene (`sceneManager`).
* Use `THREE.Group` per logical actor (Humanoid, Vectors).
* Dispose geometries and materials on unmount.
* Never mutate mesh scale for arm length tweaks; update bone or line geometry instead.

---

## 4  Tailwind CSS

* Dark‑first palette (default `dark` class on `<html>`).
* Utility classes in **logical order**: layout → box model → typography → effects.
* Custom colours in `tailwind.config.cjs` under `theme.extend.colors.eidon`.
* Components that repeat belong in `/ui/components` with minimal Tailwind (wrap in React if/when React added).

Example button:

```html
<button class="px-3 py-2 rounded bg-eidon-accent hover:bg-eidon-accent/80 text-white">
  Calibrate
</button>
```

---

## 5  Markdown & Docs

* Top‑level headers `#`, then `##`, never skip levels.
* Code fences use **triple tildes (\~\~\~)** internally to avoid ChatGPT escape issues.
* Tables: pipe‑aligned, header row underlined with `---`.
* Keep line length ≤ 100 chars for easier diff.

---

## 6  Git & Commit Messages

* Branch pattern: `feat/<area>-<short>`  /  `fix/<bug>`  /  `docs/<topic>`.
* Commit subject ≤ 72 chars, imperative: “Add DeviceStore quaternion decode”.
* If closing an issue: `Fix #42: handle NaN quaternion` in body.

---

## 7  ESLint rules (superset)

* `@typescript-eslint/no-unused-vars` — error.
* `import/order` — warn (alphabetise groups).
* `prettier/prettier` — warn; Prettier handles spacing/quotes.
* `no-console` — warn in `/src/core`, allow in `/src/ui` during dev only.

Run formatter before push: `npm run lint -- --fix`.

---

## 8  Folder / File Conventions

| Folder    | Purpose                                                         |
| --------- | --------------------------------------------------------------- |
| `/core`   | Logic with **no DOM / Three.js / Tailwind**. Pure TS, testable. |
| `/ui`     | Rendering, inputs, themes. Can import `core/*`.                 |
| `/docs`   | Project documentation & diagrams (mermaid supported).           |
| `/public` | Static assets copied as‑is (logos, GLTF).                       |

---

## 9  Testing

* Vitest with `happy‑path` fixtures for quats and vectors.
* File mirrors source path: `src/core/ArmSolver.test.ts`.
* Snapshot tests acceptable for angle arrays (< 100 lines).

---

*Last updated: 2025‑05‑25*
