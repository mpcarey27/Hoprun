# 🏃 ACR Run Tracker — LLM Agent Handoff Guide

> **Target Audience:** Any LLM Agent or Developer continuing development on this repository.  
> **Repository:** `d:\Users\Caleb\Documents\Python\hop_run`  
> **Stack:** React 19, TypeScript, Vite, Vanilla CSS Design System, Cloudflare Pages Functions, Cloudflare D1 (SQLite at the Edge), Python/FFmpeg Promo Video Renderer.

---

## 1. Executive Summary & Original Ask

### The Core Objective
The goal is to build a high-performance running workload tracker based on the scientific **Acute:Chronic Workload Ratio (ACWR / ACR)** methodology (popularized by Dr. Tim Gabbett and used by elite athletic programs).

### Reference Spreadsheet (`ACR Calc.xlsx`)
The user provided an Excel file (`ACR Calc.xlsx`) containing the reference mathematics and multipliers.  
*Key Takeaway:* **The spreadsheet was provided solely as a scientific specification, NOT as a database to be imported or hardcoded.** The application must start with a clean slate for the user's actual workouts.

### The Scientific Core
1. **Daily Workload:**
   $$\text{Daily Load} = \text{Distance (in miles)} \times \text{Run Type Multiplier}$$
   - Distance accepts double values (e.g. `3.12` miles) with a toggle to input in kilometers (`km`). If entered in km, it is converted internally using `1 mi = 1.609344 km`.
   - Athletes can log multiple runs on a single day (e.g., morning recovery + evening intervals).
2. **Run Types & Multipliers:**
   | Run Type | Multiplier | Description / Category |
   | :--- | :---: | :--- |
   | **Mod workout** | `7.0` | Tempo, threshold repeats, fartlek speedwork |
   | **Easy** | `3.0` | Zone 2 aerobic base run |
   | **Long run** | `3.0` | Weekend endurance / long steady distance |
   | **Day off** | `0.0` | Active recovery or complete rest |
   | **Race** | `8.0` | All-out competitive race effort |
   | **Fartlek** | `5.0` | Unstructured speed play |
   | **Double Threshold**| `6.0` | Norwegian method morning/evening threshold |
3. **Training Week Definition:**
   - The user can configure which day starts their training week (`Monday`, `Sunday`, or `Saturday`).
   - Weekly **Acute Workload** is the sum of daily loads across those 7 days.
4. **Chronic Workload & ACR Ratio:**
   - Requires at least 4 weeks of training history.
   - **Chronic Workload (Week $W$):**
     $$\text{Chronic}(W) = \frac{\text{Acute}(W-3) + \text{Acute}(W-2) + \text{Acute}(W-1) + \text{Acute}(W)}{4}$$
   - **Acute:Chronic Ratio (ACR):**
     $$\text{ACR}(W) = \frac{\text{Acute}(W)}{\text{Chronic}(W)}$$
5. **Injury Prevention Zones & Warnings:**
   - **Optimal "Sweet Spot":** `0.80` to `1.20` (builds fitness with lowest risk of soft-tissue injury).
   - **Critical Hazard Line:** `> 1.20` triggers immediate warnings.
   - **In-Week Prediction & Budget:** Mid-week tracking that predicts whether the runner will exceed `1.20` before the week ends, calculating the exact remaining safe workload point budget.

---

## 2. Explicit Changes Commanded by the User

During iteration, the user gave direct, strict instructions. **Never violate these rules:**

| Directive | What Was Changed & Current Implementation |
| :--- | :--- |
| **"Stop trying to open browsers."** | **DO NOT use browser subagents or automated browser launching.** Chrome DevTools / Playwright hangs on this Windows environment. Use headless tests, local scripts, and the Vite terminal dev server. |
| **"Stop putting in workout suggestions."** | Removed all unsolicited popups, suggested workouts, or fake template recommendations. The app only tracks what the user logs or what their coach assigns. |
| **"Don't take data from the spreadsheet, its just an example."** | Clean slate initial state. No pre-seeded spreadsheet rows. Workouts start empty or from `localStorage`/Cloudflare D1. |
| **"When you open it, it should just show todays date, and runs (if any) or the ability to add new run."** | The default active tab is **`Log Run` (Tab 1)**. It immediately displays today's date, existing runs for today (or empty state), and a big `+ Add Run` action. |
| **"Do a calendar icon to switch to another day and add a run there."** | Added an interactive calendar picker and date stepping buttons (`‹ Previous Day`, `Today`, `Next Day ›`) allowing athletes to log past or future runs instantly. |
| **"Look at how Strava does this stuff... have a tab where you can view other workouts."** | Added **`Workouts` (Tab 2)** with a Strava-style summary bar (*Total Activities, Total Distance, Total Workload Stress*), filter pills by run type, and search query box. |
| **"Remove the icons from plan builder. And csv."** | Stripped all tacky emojis and glowing icons from action buttons. Buttons are styled as clean, professional text: `Plan Builder & QR` and `Export CSV`. |
| **"The week starts dropdown has horrible contrast. Change that, white on black or the background colour."** | Styled `.select-week-start` to pure `#ffffff` bold text on `#000000` pitch-black background with a crisp border. Perfectly legible in all lighting. |
| **"Also make the ACR a fun logo with a shoe."** | Designed an athletic running shoe vector SVG logo (`Header.tsx` and `generate_promo.py`) featuring dynamic speed trails, thick rocker midsole, and grip lugs. |
| **"Hide production auth settings doesn't look great. Continue with Google does not actually take me to a Google account login."** | Redesigned `GoogleAuthModal.tsx` into a dark-themed settings drawer with an expandable config section, and wired the primary button to directly launch real Google Sign-In (`https://accounts.google.com/ServiceLogin` or Google OAuth 2.0). |
| **"There is an overflow on the comments that is also not needed. Make sure the text wraps."** | Applied `white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;` across all workout notes, comment textareas, and cards. |
| **"Add the option to extend the plan from the coaches point of view beyond a week. Give multiweek, month options."** | Upgraded `AdminPlanModal.tsx` with duration pills (`1 Week`, `2 Weeks`, `3 Weeks`, `4 Weeks (Month)`, `+ Add Week`), week navigation tabs, and multi-week plan serialization. |
| **"Also the QR code doesn't actually scan."** | **Root cause:** 4-week JSON payloads were 5,700+ characters, creating dense, unscannable 177x177 dot matrices. **Solution:** Implemented Gzip Base64URL compression (`src/utils/planShare.ts`) via browser-native `CompressionStream`, reducing URLs to ~250–400 chars. Also bound Vite to `--host` and injected the local Wi-Fi IP (`http://192.168.88.15:5173`) so mobile cameras on the same network load plans instantly. |
| **"Generate an advert style 10 second promo video... with cool text: 'Get curated plans', 'Optimize your runs', 'Avoid injuries'."** | Built `generate_promo.py`, producing `acr_promo_video.mp4` (1920x1080 @ 30fps, 10.0s) with synchronized synthesized audio (bass kick, clicks, chimes, chord outro) and custom vector graphics. |
| **"Examine the UI for best practices. There is a lot of clutter and it doesn't look nice."** | Redesigned the entire UI using Strava/Whoop dark athletic tokens: streamlined header with centered nav pills and avatar profile popover; replaced permanent 110px green alert banner with a 34px compact status ribbon (`.inweek-ribbon-optimal`); revamped the run logger with a Hero distance input, live stress math badge, and quick-tap category chips. |

---

## 3. Project Structure

```
d:\Users\Caleb\Documents\Python\hop_run\
├── .gitignore                  # Git exclusions (includes .serena/, graphify-out/, .chrome_tmp/)
├── ACR Calc.xlsx               # Original reference workbook (FOR FORMULA REFERENCE ONLY)
├── acr_promo_video.mp4          # 10-second commercial promo video (1080p, audio-synced)
├── generate_promo.py           # FFmpeg + PIL headless video generator
├── index.html                  # HTML entry point
├── package.json                # Project dependencies (React 19, Lucide, QRCode)
├── vite.config.ts              # Vite configuration
├── wrangler.toml               # Cloudflare Pages / D1 configuration
├── d1/
│   └── schema.sql              # Edge SQLite schema for Cloudflare Free Tier
├── functions/
│   └── api/
│       └── [[route]].ts        # Cloudflare Pages Functions serverless edge API
└── src/
    ├── App.tsx                 # Core application controller & QR URL parser
    ├── index.css               # Comprehensive athletic design system (54KB CSS)
    ├── main.tsx                # React DOM mount point
    ├── types/
    │   └── acr.ts              # Domain types (WorkoutRun, TrainingPlan, WeekWorkload, etc.)
    ├── utils/
    │   ├── calculations.ts     # ACR workload math & algebraic prediction engine
    │   ├── planShare.ts        # Gzip Base64URL plan compression & decompression
    │   ├── storage.ts          # LocalStorage sync & persistence
    │   └── csvExport.ts        # Data export to CSV
    └── components/
        ├── Header.tsx          # Brand shoe logo, high-contrast dropdown, tabs, role toggle
        ├── LogRunTab.tsx       # Tab 1: Today-centric run logger with calendar picker
        ├── WorkoutsTab.tsx     # Tab 2: Strava-style activity history & search
        ├── TrainingLogTab.tsx  # Tab 3: Week-by-week & month-by-month grid overview
        ├── AnalyticsTab.tsx    # Tab 4: Interactive charts (0.8-1.2 sweet spot & warnings)
        ├── InWeekWarningBanner.tsx # Dynamic mid-week hazard warning
        ├── AdminPlanModal.tsx  # Coach multi-week plan builder & QR generator
        ├── PlanViewerModal.tsx # Athlete plan importer & coach notification dispatcher
        ├── GoogleAuthModal.tsx # Dark Google OAuth login & config drawer
        └── NotificationCenter.tsx # In-app notification center for coaches
```

---

## 4. Code Intelligence Tools: Serena & Graphify

This repository is equipped with two developer intelligence tools: **Serena** and **Graphify**. Both tools generate local analysis caches and are excluded from git version control via `.gitignore`.

### A. Serena (LSP Code Intelligence & Persistent Memory)
- **What it is:** Serena provides Language Server Protocol (LSP) diagnostics, code navigation, symbol inspection, semantic search, and project memory persistence directly inside the workspace.
- **Persistent Memory Directory (`.serena/`):**
  - Stores project memories across chat sessions:
    - `mem:core`: High-level architecture, ACWR formula specifications, and user directives.
    - `mem:tech_stack`: React 19, Vite, TypeScript, Cloudflare Pages/D1 stack details.
    - `mem:suggested_commands`: Terminal commands for building, running, and deploying.
    - `mem:conventions`: Strict architectural rules (no fake seed data, zero emoji icons, no automated browsers).
    - `mem:task_completion`: Checklists and verification steps.
- **Web Dashboard:** Runs locally at `http://127.0.0.1:24282/dashboard/index.html` for visual inspection of symbols and project state.
- **Diagnostics Verification:** Serena provides instant TypeScript LSP diagnostic checks (`get_diagnostics_for_file`), guaranteeing 0 syntax or type errors without triggering slow CLI builds.

### B. Graphify (Code Graph & AST Extraction)
- **What it is:** Graphify scans the codebase using tree-sitter AST parsers to build an interactive dependency and relationship graph (`graphify-out/`).
- **AST Cache (`graphify-out/cache/`):**
  - Indexes all TypeScript, TSX, CSS, and configuration files.
  - Generates structural call graphs, symbol references, and component hierarchies.
- **How to Run Graphify Locally:**
  ```bash
  # Run the fast local AST graph generator (does NOT require openai or external API keys):
  graphify . --no-semantic
  ```
  - This outputs `graphify-out/graph.html`, which can be opened in any web browser to explore visual dependency graphs.
  - *Note on Semantic Pass:* Running plain `graphify .` attempts an OpenAI embedding pass for markdown files. If the `openai` Python package is not installed or no API key is present, always use `--no-semantic` to generate the complete AST code graph cleanly.

### C. Git Ignore Verification
Both tool directories are safely ignored in `.gitignore`:
```gitignore
# Serena & Graphify Tooling Artifacts
.serena/
graphify-out/
.chrome_tmp/
```

---

## 5. Absolute Beginner Step-by-Step Setup Guide

> **Note for the Next Developer:** If this is your **very first software project**, don't worry! Follow these exact step-by-step instructions to get the application running on your computer.

### Step 1: Install System Prerequisites

#### On macOS
1. Open the **Terminal** app (press `Cmd + Space`, type `Terminal`, and hit `Enter`).
2. Install **Homebrew** (the macOS package manager) if you don't already have it:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Install **Node.js** (LTS version) and **Git**:
   ```bash
   brew install node git
   ```
4. Verify your installations:
   ```bash
   node -v    # Should print v18.x or v20.x or higher
   npm -v     # Should print 9.x or 10.x or higher
   git --version
   ```

#### On Windows
1. Open **PowerShell as Administrator** (press `Windows Key`, search for `PowerShell`, right-click and select **Run as Administrator**).
2. Enable script execution (required on Windows to run local Node tools):
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```
3. Install **Node.js (LTS)** and **Git** using Windows Package Manager (`winget`):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   ```
   *(Alternatively, download the installers directly from [nodejs.org](https://nodejs.org) and [git-scm.com](https://git-scm.com)).*
4. Close PowerShell and reopen a standard PowerShell terminal. Verify:
   ```powershell
   node -v    # e.g., v20.x.x
   npm -v     # e.g., 10.x.x
   git --version
   ```

---

### Step 2: Open the Project Directory
Navigate into the project folder:
- **macOS / Linux:**
  ```bash
  cd ~/Documents/Python/hop_run
  ```
- **Windows:**
  ```powershell
  cd D:\Users\Caleb\Documents\Python\hop_run
  ```

---

### Step 3: Install Node Dependencies
Download all project libraries (React, Vite, Lucide icons, QRCode generator, TypeScript):
```bash
npm install
```
*(This will populate the `node_modules/` folder. It usually takes 15–30 seconds).*

---

### Step 4: Start the Local Development Server
Run the local Vite server:
```bash
npm run dev -- --host
```

You will see output in the terminal looking like this:
```text
  VITE v6.x.x  ready in 240 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.xx.xx:5173/
  ➜  press h + enter to show help
```

---

### Step 5: View the Application
1. Open your web browser (Chrome, Safari, Firefox, Edge).
2. Navigate to: **`http://localhost:5173/`**
3. **To test on your mobile phone:** Connect your phone to the same home Wi-Fi network and open the `Network` URL (e.g. `http://192.168.xx.xx:5173/`) or scan a QR code generated in the Plan Builder!

---

### Step 6: Common Beginner Gotchas & Solutions

| Problem | Cause | How to Fix |
| :--- | :--- | :--- |
| `EADDRINUSE: port 5173 is already in use` | Another dev server is already running on that port. | Run `npm run dev -- --port 5174` or close the other running terminal. |
| `npm : File ... cannot be loaded because running scripts is disabled` (Windows) | Windows PowerShell security policy defaults to Restricted. | Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` in PowerShell. |
| QR Code doesn't open on your phone | Phone is not on the same Wi-Fi, or your computer's firewall is blocking incoming connections. | Ensure both devices share the same Wi-Fi network. If Windows Firewall prompts you to allow Node.js on Private Networks, click **Allow**. |
| Blank white screen in browser | Browser cache or syntax error. | Press `F12` to open DevTools, check the **Console** tab for errors, and do a hard reload (`Cmd + Shift + R` or `Ctrl + F5`). |

---

### Step 7: Setting Up a GitHub Repository (First-Time Beginner Walkthrough)

If you have never set up a GitHub repository before, follow these exact steps to get this codebase published and backed up on GitHub:

#### 1. Create a New Repository on GitHub
1. Open your browser and go to [github.com](https://github.com). Log in (or create a free account).
2. In the top-right corner of the page, click the **`+`** icon and select **New repository**.
3. **Repository name:** Enter `hop_run` (or your preferred name, e.g. `acr-run-tracker`).
4. **Description:** Enter an optional summary (e.g. `Scientific ACWR Running Workload & Injury Prevention Tracker`).
5. Choose **Public** (visible to everyone) or **Private** (only you and invited collaborators).
6. ⚠️ **CRITICAL:** Under the section *"Initialize this repository with:"*, leave **all checkboxes UNCHECKED**:
   - ❌ Do NOT check "Add a README file"
   - ❌ Do NOT check "Add .gitignore"
   - ❌ Do NOT check "Choose a license"  
   *(We already have these files prepared locally!)*
7. Click the green **Create repository** button.

#### 2. Set Up Your Git Name & Email (One-Time Setup)
In your terminal (macOS Terminal or Windows PowerShell), tell Git who you are:
```bash
git config --global user.name "Your Name or Nickname"
git config --global user.email "your.email@example.com"
```

#### 3. Stage & Commit Your Files Locally
Navigate to the project root and stage the project:
```bash
# Check existing status:
git status

# Stage all files (respects .gitignore, excluding node_modules, .serena, etc.):
git add .

# Create your first snapshot commit:
git commit -m "Initial commit: ACR Run Tracker with athletic UI, math engine, and handoff guide"
```

#### 4. Link to GitHub and Push
Copy the GitHub repository URL from the page you just created, and run:
```bash
# Ensure your default branch is named 'main':
git branch -M main

# Link your local folder to GitHub (replace YOUR-USERNAME with your GitHub handle):
git remote add origin https://github.com/YOUR-USERNAME/hop_run.git

# Push your code up to GitHub:
git push -u origin main
```

#### 5. Authenticating on Your First Push
When you run `git push -u origin main`:
- Git will prompt you to authenticate. On Windows and macOS, a browser tab will automatically open asking you to **"Sign in with your browser"** (Git Credential Manager).
- Click **Authorize git-credential-manager**.
- Once authorized, Git securely saves your credentials on your computer so you will **never have to enter your password again**.
- Return to your terminal—you will see code uploading to GitHub! Refresh your GitHub browser tab to see your full project live.

#### 6. Everyday Git Workflow (Once Set Up)
Whenever you make updates or write new test functions in the future, save your work in 3 simple commands:
```bash
git add .
git commit -m "Describe what feature or test you added"
git push
```

---

## 6. Test-Driven Development (TDD): MANDATORY Test Functions

> ⚠️ **CRITICAL DIRECTIVE FOR THE NEXT AGENT / DEVELOPER:**  
> **You MUST write test functions FIRST before adding new features, modifying mathematics, or changing UI components.**  
> Never commit untraced code changes. First write the failing test, then implement the feature, then confirm all tests pass.

### Setting Up the Test Suite
The project uses **Vitest** + **@testing-library/react** for ultra-fast, zero-configuration TypeScript testing.

If not already installed:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add the test command to `package.json`:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

---

### A. Core Mathematical & Functional Unit Tests (`tests/calculations.test.ts`)
Write these test functions **first** to ensure scientific calculations never regress:

1. **`test_calculateRunLoad_multipliers()`**
   - **Goal:** Verifies that multiplying distance by run type yields exact workload values.
   - **Test Cases:**
     - 5.0 miles of `easy` (multiplier 3.0) $\rightarrow$ `15.0` load.
     - 4.0 miles of `mod_workout` (multiplier 7.0) $\rightarrow$ `28.0` load.
     - 10.0 miles of `long_run` (multiplier 3.0) $\rightarrow$ `30.0` load.
     - 3.1 miles of `race` (multiplier 8.0) $\rightarrow$ `24.8` load.
     - Any distance on a `day_off` (multiplier 0.0) $\rightarrow$ `0.0` load.

2. **`test_calculateRunLoad_km_conversion()`**
   - **Goal:** Verifies km inputs convert accurately to miles before applying the multiplier.
   - **Test Case:** 10.0 km of `easy` run $\rightarrow$ $\frac{10.0}{1.609344} \times 3.0 \approx 18.64$ load.

3. **`test_convertDistance_precision()`**
   - **Goal:** Verifies roundtrip precision between miles and kilometers.
   - **Test Cases:**
     - `convertDistance(10, 'mi', 'mi') === 10`
     - `convertDistance(1, 'mi', 'km') === 1.609344`
     - `convertDistance(1.609344, 'km', 'mi') === 1.0`
     - Distance `0` returns `0`.

4. **`test_inWeekPrediction_safeMaxLoad()`**
   - **Goal:** Verifies the algebraic formula for $A_{\text{safe}}$ at the critical threshold $T = 1.20$:
     $$A_{\text{safe}} = \frac{1.20 \cdot \text{Prev3Sum}}{2.80}$$
   - **Test Case:** If previous 3 weeks had acute loads of 100, 100, 100 ($\text{Prev3Sum} = 300$), then $A_{\text{safe}} = \frac{1.20 \times 300}{2.80} \approx 128.57$.

5. **`test_inWeekPrediction_remainingBudget_clamping()`**
   - **Goal:** Ensures that remaining budget is clamped to $\ge 0$ when an athlete has already exceeded safe load.
   - **Test Case:** If $A_{\text{safe}} = 100$ and completed load is 115, `remainingSafeLoad` must return `0`, not negative numbers.

6. **`test_chronicWorkload_4WeekWindow()`**
   - **Goal:** Verifies that chronic workload returns `null` for weeks 1–3, and calculates the exact 4-week moving average starting on week 4.
   - **Test Cases:**
     - Week 1, 2, 3: `chronicWorkload === null`, `status === 'baseline'`.
     - Week 4 with acute loads [100, 120, 110, 130]: Chronic $= \frac{100 + 120 + 110 + 130}{4} = 115.0$, ACR $= \frac{130}{115.0} \approx 1.13$ (`status === 'safe'`).

7. **`test_planShare_gzip_roundtrip()`**
   - **Goal:** Verifies that compressing a multi-week training plan via `compressPlan()` and decoding via `decompressPlan()` preserves all dates, distances, run types, and comments without data loss.

---

### B. UI Component & Interaction Tests (`tests/ui.test.tsx`)
Write these UI tests **first** to prevent layout clutter and broken user flows:

1. **`test_LogRunTab_renderTodayDefault()`**
   - **Goal:** Verifies that opening Tab 1 defaults to today's date, displays the calendar icon button, and shows the clean empty state when no runs exist.

2. **`test_LogRunTab_heroDistanceLiveStressUpdate()`**
   - **Goal:** Verifies tactile, real-time stress calculation as the athlete types.
   - **Simulate:** Type `6.0` into the hero distance input, click the `Mod workout (×7.0)` chip.
   - **Assert:** The workload stress pill immediately updates to display `42.0` (`6.00 mi × 7.0`).

3. **`test_LogRunTab_unitToggleInteraction()`**
   - **Goal:** Verifies clicking the unit button toggles between `MI` and `KM` and updates display values without resetting input focus.

4. **`test_InWeekWarningBanner_optimalRibbon_vs_criticalBanner()`**
   - **Goal:** Ensures no alert fatigue during normal training.
   - **Test Cases:**
     - When `projectedAcr <= 1.20`, render the sleek `.inweek-ribbon-optimal` (34px ribbon).
     - When `hasAlreadyExceeded === true`, render `.inweek-critical` with red warning badges and the deficit point count.

5. **`test_WorkoutsTab_filterCategoryPills()`**
   - **Goal:** Verifies that clicking category filter pills ('Easy', 'Long run', 'Race') accurately filters the activity cards in the feed.

6. **`test_Header_settingsPopoverToggle()`**
   - **Goal:** Verifies that clicking the user avatar opens the settings popover drawer (unit toggle, week start day, role switcher) and closing it keeps state intact without navigating away.

---

### C. Automated Mobile Viewport & Responsive Tests (`tests/responsive.test.tsx`)
Because athletes primarily access this app on smartphones at the track or after a run, **mobile layout regression tests are mandatory**:

1. **`test_Header_mobile_dropdown_swap()`**
   - **Goal:** Verifies that when viewport width is set to mobile ($\le 768\text{px}$), the horizontal tab pills `.desktop-tabs-nav` are hidden, and the mobile navigation `<select>` dropdown `.mobile-tab-selector-container` is active.
   - **Simulate:** Dispatch window resize event with `innerWidth = 375`.
   - **Assert:** Changing `<select>` value to `workouts` fires `onTabChange('workouts')`.

2. **`test_RunCard_heroRow_sideBySide_mobile()`**
   - **Goal:** Verifies that under 360px and 390px mobile viewports, `.run-card-hero-row` maintains a 2-column grid (`grid-template-columns: 1fr 1fr`).
   - **Assert:** The Distance input box and the Workload Stress pill have matching heights (44px) and remain side-by-side without wrapping into a single vertical column.

3. **`test_DayQuickMetrics_2x2_grid_mobile()`**
   - **Goal:** Verifies that under mobile screen widths ($\le 640\text{px}$), `.day-quick-metrics` renders with 2 columns, ensuring a clean 2×2 grid with no single orphaned box.

4. **`test_WorkoutChips_compact_noMultiplierText()`**
   - **Goal:** Asserts that `.workout-chips-grid` renders chips with color dots and category names only (no `×7`, `×3` text tags), fitting cleanly without horizontal scrolling.

---

### D. Real Device Testing Protocol: Mobile Phone & Computer

Whenever modifying UI or layouts, the next agent/developer **MUST test on BOTH a physical mobile phone and a desktop computer**:

#### 1. Real Mobile Phone Testing (Physical iOS / Android Device)
1. Start the Vite server with host exposure:
   ```bash
   npm run dev -- --host
   ```
2. Connect your mobile phone to the **same Wi-Fi network** as your computer.
3. Open the phone's browser (Safari on iPhone, Chrome on Android) and navigate to the displayed Network IP address (e.g. `http://192.168.xx.xx:5173/`).
4. **Mandatory Mobile Checklist:**
   - [ ] **Mobile Header Navigation:** Ensure the header tab dropdown lets you switch between `Log Run`, `Workouts`, `Training Log`, and `Analytics` effortlessly with your thumb.
   - [ ] **Zero Horizontal Overflow:** Try swiping left/right—the page must be strictly locked to 100% viewport width with zero horizontal wobbling or clipped cards.
   - [ ] **Side-by-Side Miles & Stress:** Look at the active run card—verify the Distance box (`[ 5 | MI ]`) and Workload Stress score (`[ 35.0 ]`) sit side-by-side on the same row.
   - [ ] **2×2 Metric Grid:** Look at the top summary under the date—verify the 4 metric boxes form a clean, symmetrical 2×2 grid.
   - [ ] **QR Code Scanning & Import:** On your computer, open `Plan Builder & QR`. Point your mobile phone camera at the screen's QR code. Tap the link on your phone—verify that the multi-week training plan loads and prompts to import.
   - [ ] **Touch Targets:** Verify all buttons and category chips are easily tappable with fingers without accidental misclicks.

#### 2. Computer / Desktop Browser Testing
1. Navigate to `http://localhost:5173/` in your desktop browser.
2. **Mandatory Desktop Checklist:**
   - [ ] **Header Pills:** Confirm all 4 tab pills (`Log Run`, `Workouts`, `Training Log`, `Analytics`) display centered with smooth pill-hover states.
   - [ ] **Full 4-Column Metrics Bar:** Confirm Day Volume, Day Workload, Week Acute, and Week ACR render across a full horizontal 4-column strip.
   - [ ] **Responsive Breakpoint Simulation:** Open DevTools (`F12`), toggle **Device Toolbar** (`Ctrl + Shift + M` / `Cmd + Shift + M`), and test across:
     - **iPhone SE (375px)**
     - **iPhone 14 / 15 Pro (393px)**
     - **Pixel 7 (412px)**
     - **iPad / Tablet (768px)** — verifies the exact breakpoint boundary.
     - **Full Desktop (1280px+)**
   - [ ] **Zero Console Errors:** Open the DevTools Console tab and ensure zero React hydration, syntax, or rendering warnings.

---

## 7. Development & Deployment Cheatsheet

### Running the Application
```powershell
# Vite dev server with LAN host exposure:
npm run dev -- --host --port 5173
```
Dev URLs:
- Local: `http://localhost:5173/`
- Network: `http://192.168.88.15:5173/`

### Linting & Building
```powershell
# Type check and build production bundle
npm run build
```

### Re-rendering the 10-Second Promo Video
If promo video assets or messaging need to be updated:
```powershell
python -u generate_promo.py
```
This generates `acr_promo_video.mp4` (H.264 + AAC, 1920x1080 @ 30fps) with synced audio sound effects.

### Deploying to Cloudflare Pages (Free Tier)
```powershell
# Build bundle
npm run build

# Deploy via Wrangler
npx wrangler pages deploy dist --project-name hop-run
```

---

## 8. What to Do Next (Potential Future Enhancements)

If the user asks for further features, prioritize:
1. **Garmin / Strava OAuth Webhook Integration:** Auto-syncing completed runs directly into the daily log.
2. **Cloudflare D1 Remote Provisioning:** Running `wrangler d1 create acr-db` and executing `d1/schema.sql` on Cloudflare for production multi-user sync.
3. **PWA Offline Manifest:** Adding a service worker so athletes can log runs in areas with no cellular coverage.
