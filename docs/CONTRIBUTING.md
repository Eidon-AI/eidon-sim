# Contributing to **Eidon Sim**

First off, thank you for taking the time to contribute! This project is community‑friendly and follows an open, respectful review process. The sections below explain how to get a local dev environment running, coding standards, and the pull‑request workflow.

---

## 1  Prerequisites

| Tool                   | Version                 |
| ---------------------- | ----------------------- |
| Node.js                | ≥ 18 LTS                |
| npm                    | ≥ 9 (bundled with Node) |
| Git                    | ≥ 2.30                  |
| Chromium‑based browser | ≥ v89 (WebHID support)  |

Optional: VS Code + the **ESLint** and **Tailwind CSS** extensions.

---

## 2  Getting started

```bash
# fork and clone
git clone https://github.com/<your-username>/eidon-sim.git
cd eidon-sim

# install dependencies
npm install

# start dev server (opens http://localhost:5173)
npm run dev
```

> On first run Chrome will ask to enable "experimental web platform features"; enable and relaunch.

---

## 3  Branch & Commit conventions

* **Branch names**
  `feat/<area>-<slug>`   `fix/<bug>`   `docs/<topic>`

  Examples:

  * `feat/arm-solver`
  * `fix/quat-nan`
  * `docs/hid-spec-diagram`

* **Commit messages**  (single‑line subject ≤ 72 chars; body optional)

  ```
  Add DeviceStore quaternion decode

  • Implements u16→float conversion.
  • Normalises quaternion.
  Fix #42.
  ```

* Squash commits are fine; the reviewer will guide merge strategy.

---

## 4  Code style checklist

1. TypeScript strict — no `any`.

2. Follow `STYLEGUIDE.md` for naming/import order.

3. Run formatter & linter:

   ```bash
   npm run lint -- --fix
   ```

4. Keep code fences inside docs using **triple tildes (\~\~\~)**.

5. No DOM/Three.js imports inside `/src/core/*`.

---

## 5  Running tests

Vitest is configured but minimal.

```bash
npm run test    # watch mode
npm run test:ci # single run for CI
```

Add tests under the same folder as code: `ArmSolver.test.ts`.

---

## 6  Updating documentation

Docs live in `/docs` and root `.md` files.  When you introduce a public API, HID change, or major architecture tweak **update the relevant doc in the same PR**.  Use the same Markdown rules: header hierarchy, tildes for code, max line 100.

---

## 7  Pull‑request workflow

1. Push your branch to your fork.
2. Open a PR against **main**.
3. The CI will run lint + build + tests.
4. At least one core maintainer review is required (24‑48 h typical).
5. After approval, a maintainer will squash‑merge.

If your PR is draft/WIP, prefix the title with `[Draft]`.

---

## 8  Release process (maintainers)

1. Ensure `CHANGELOG.md` has a new entry under **Unreleased**.
2. Bump version in `package.json` (`npm version minor|patch`).
3. Tag commit & push.
4. GitHub Action deploys `dist/` to Pages.

---

## 9  Code of Conduct

Everyone interacting in this repo is expected to follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) § 2.1.

---

Happy hacking — we’re excited to see your ideas land in Eidon Sim!

*Last updated : 2025‑05‑25*
