# 🛡️ Steam Guard Desktop

A modern, lightweight Steam Desktop Authenticator built with Electron. Generate 2FA codes, manage trade confirmations, and create new Steam Guard authenticators — all without needing a phone number.

![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=9FEAF9)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Steam](https://img.shields.io/badge/Steam-000000?style=for-the-badge&logo=steam&logoColor=white)

---

## ✨ Features

- **🔐 Steam Guard Codes** — Real-time TOTP code generation with animated countdown timer
- **📋 Trade Confirmations** — View, accept, and deny trade/market confirmations with expandable details
- **📦 .maFile Management** — Import, export, and manage multiple Steam accounts via drag & drop
- **🆕 Create New Guard** — Set up Steam Guard authenticator on accounts without a phone number
- **⚡ Batch Operations** — Accept or deny all confirmations at once
- **🔄 Auto-Refresh** — Automatic confirmation polling every 10 seconds
- **✅ Auto-Confirm** — Automatically accept all incoming confirmations
- **🔒 AES-256 Encryption** — Protect your .maFile data with a master password
- **⏱️ Time Sync** — Synchronize with Steam servers for accurate code generation
- **🎨 Modern UI** — Dark theme with glassmorphism, smooth animations, and Steam-inspired design

## 📸 Screenshots

### Steam Guard Code Generation
> Real-time 2FA code with animated progress ring and one-click copy

### Trade Confirmations
> Expandable confirmation cards with detailed trade info, batch accept/deny

### Account Management
> Import .maFile via button or drag & drop, export and remove accounts

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [Git](https://git-scm.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/SerhiiLutyk/Steam-Guard-Desktop.git
cd Steam-Guard-Desktop

# Install dependencies
npm install

# Run the app
npm start
```

### Building

The app uses a manual build process with 7-Zip:

```bash
# The dist/ManualBuild directory contains the Electron runtime
# Copy updated source files and zip for distribution
```

## 🏗️ Project Structure

```
steam-desktop-auth/
├── main.js                  # Electron main process & IPC handlers
├── preload.js               # Context bridge (renderer ↔ main)
├── package.json
├── src/
│   ├── assets/
│   │   └── icon.svg         # App icon
│   ├── pages/
│   │   ├── index.html       # Main UI layout
│   │   ├── styles.css       # Design system & components
│   │   └── app.js           # Frontend SPA logic
│   └── services/
│       ├── steam-auth.js    # Steam session authentication
│       ├── totp-service.js  # TOTP code generation (steam-totp)
│       ├── confirmations.js # Trade confirmation management
│       ├── storage.js       # .maFile storage & account management
│       └── crypto-service.js# AES-256-CBC encryption
```

## 🔧 Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | Electron |
| **Auth** | steam-session |
| **2FA** | steam-totp |
| **Confirmations** | steamcommunity |
| **Encryption** | Node.js crypto (AES-256-CBC) |
| **UI** | Vanilla HTML/CSS/JS |

## 📝 Usage

### Import Existing Accounts
1. Go to **Accounts** tab
2. Click **Import .maFile** or drag & drop your `.maFile`
3. Your account appears in all selectors

### Generate 2FA Codes
1. Go to **Guard** tab
2. Select your account from the dropdown
3. Code generates automatically with a 30-second countdown
4. Click the code or **Copy** button to copy to clipboard

### Manage Trade Confirmations
1. Go to **Login** tab and authenticate your account
2. Go to **Trades** tab and select your account
3. Confirmations load automatically on account switch
4. Click **▼** to expand details, **✓** to accept, **✕** to deny
5. Use **Accept All** / **Deny All** for batch operations
6. Enable **Auto-Refresh** or **Auto-Confirm** for automation

### Create New Steam Guard
1. Go to **Create** tab
2. Enter your Steam login and password
3. Enter the email verification code sent by Steam
4. Save the **recovery code** (critical!)
5. Enter the SMS/email activation code
6. Done — your `.maFile` is saved and encrypted

## 🔐 Security

- All `.maFile` data is stored locally in `%APPDATA%/steam-desktop-auth/accounts/`
- Optional AES-256-CBC encryption with PBKDF2 key derivation (100,000 iterations)
- No data is sent to any third-party servers
- Passwords and secrets never leave your machine

## ⚠️ Disclaimer

This project is for educational purposes. Use at your own risk. The author is not responsible for any account bans, lost items, or other consequences. Always keep backup copies of your recovery codes and `.maFile` data.

## 📄 License

This project is provided as-is without any specific license. Feel free to use and modify for personal use.
