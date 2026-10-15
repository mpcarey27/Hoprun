# 🏃 ACR Run Tracker

A modern, high-performance running workload tracker built on the scientific **Acute:Chronic Workload Ratio (ACWR / ACR)** methodology to optimize endurance training and prevent soft-tissue injury.

---

## 💻 How to Set Up & Run on Another Computer

Follow these simple steps when moving or cloning this project onto a new computer (Windows, macOS, or Linux).

### Step 1: Install Prerequisites
Before running the project, make sure the new computer has **Node.js** installed:
1. Go to **[https://nodejs.org/](https://nodejs.org/)**
2. Download and install the **LTS (Long Term Support)** version (v18, v20, or newer).  
   *Note: This automatically includes `npm` (Node Package Manager).*
3. Verify the installation by opening a terminal (PowerShell, Command Prompt, or Terminal) and typing:
   ```bash
   node -v
   npm -v
   ```
   Both commands should output version numbers.

---

### Step 2: Copy or Clone the Project
1. Copy the `hop_run` folder to your new computer (via USB drive, zip file, or Git).
2. **Tip:** You do **NOT** need to copy the `node_modules` folder. It is large and will be cleanly installed in the next step.

---

### Step 3: Install Project Dependencies
Open your terminal or command prompt, navigate into the project folder, and install the required packages:

```bash
# Navigate to the folder (adjust the path if different on the new machine)
cd path/to/hop_run

# Install dependencies
npm install
```

This will automatically download all necessary libraries (React, Vite, TypeScript, QRCode, Lucide icons, etc.) in a few seconds.

---

### Step 4: Start the Local Development Server

Run either of the following commands:

#### Option A: Local machine only
```bash
npm run dev
```
Open your browser and navigate to:  
👉 **`http://localhost:5173/`**

#### Option B: Allow phones and tablets on your Wi-Fi to connect (Recommended for QR Scanning)
```bash
npm run dev -- --host
```
Vite will display two URLs in your terminal:
- **Local:** `http://localhost:5173/` (for your computer)
- **Network:** `http://192.168.x.x:5173/` (for any phone, tablet, or laptop on the same Wi-Fi)

> **Windows Firewall Note:** If Windows Defender pops up asking for network access when running with `--host`, click **"Allow access"** on Private networks so your mobile phone can load the app and scan QR codes.

---

### Step 5: How to Stop the Server
Whenever you want to stop the local server, click into your terminal window and press:  
`Ctrl + C` (or `Cmd + C` on Mac).

---

## 🛠️ Additional Useful Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the fast local development server with instant live reload. |
| `npm run dev -- --host` | Starts the server and shares it across your local Wi-Fi network. |
| `npm run build` | Compiles the production bundle into the `dist/` folder. |
| `npm run preview` | Locally tests and previews the compiled production build from `dist/`. |
| `python -u generate_promo.py` | *(Optional)* Re-renders the 10-second 1080p promo video with audio effects (requires Python 3.10+ and FFmpeg). |

---

## 📱 Mobile QR Code Plan Sharing

1. Open the app as a Coach and click **Plan Builder & QR**.
2. Customize the multi-week training plan.
3. Click **Generate QR Code**.
4. Open the camera on your phone (connected to the same Wi-Fi) and scan the on-screen QR code.
5. The full multi-week plan will instantly open and import into your phone's browser with zero cloud setup required!

---

## 📖 Science & Methodology

- **Daily Workload:** $\text{Distance (miles)} \times \text{Run Multiplier}$
- **Acute Workload:** Total load over the current 7-day training week.
- **Chronic Workload:** 4-week rolling average of acute workloads:  
  $\text{Chronic}(W) = \frac{\text{Acute}(W-3) + \text{Acute}(W-2) + \text{Acute}(W-1) + \text{Acute}(W)}{4}$
- **ACR Ratio:** $\frac{\text{Acute}(W)}{\text{Chronic}(W)}$
- **Target Zones:**
  - `0.80` to `1.20` = **Optimal Training "Sweet Spot"** (safely builds fitness)
  - `> 1.20` = **Injury Hazard Zone** (triggers mid-week and end-of-week injury warnings)

---

## 📂 Developer & AI Handoff Reference

For complete engineering documentation, database schemas (`d1/schema.sql`), scientific formula algebra, and history of all design decisions, see:  
📄 **[AGENT_HANDOFF.md](AGENT_HANDOFF.md)**
