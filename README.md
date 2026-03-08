# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

```
lifeos-react
├─ .history
│  ├─ index_20260304221756.html
│  ├─ index_20260305001050.html
│  ├─ index_20260305003214.html
│  ├─ public
│  │  ├─ manifest_20260304223503.json
│  │  ├─ manifest_20260305001015.json
│  │  ├─ manifest_20260305003315.json
│  │  ├─ sw_20260304223503.js
│  │  └─ sw_20260305001609.js
│  └─ src
│     ├─ App_20260304211642.css
│     ├─ App_20260304221756.jsx
│     ├─ App_20260304222942.jsx
│     ├─ App_20260304233332.jsx
│     ├─ App_20260304233502.jsx
│     ├─ App_20260304233511.jsx
│     ├─ App_20260304234916.jsx
│     ├─ App_20260305002310.jsx
│     ├─ App_20260305002806.css
│     ├─ engine
│     │  ├─ mapEngine_20260304221756.js
│     │  ├─ mapEngine_20260305003925.js
│     │  └─ mapEngine_20260305004112.js
│     ├─ features
│     │  ├─ finance
│     │  └─ wardrobe
│     │     ├─ components
│     │     │  ├─ WardrobeHeader_20260304231750.jsx
│     │     │  └─ WardrobeHeader_20260305000746.jsx
│     │     ├─ hooks
│     │     │  ├─ useWardrobeData_20260304231435.js
│     │     │  ├─ useWardrobeData_20260304234111.js
│     │     │  ├─ useWardrobeData_20260304234132.js
│     │     │  ├─ useWardrobeData_20260304234137.js
│     │     │  └─ useWardrobeData_20260304234628.js
│     │     ├─ wardrobe_20260304231435.css
│     │     └─ wardrobe_20260305002255.css
│     └─ styles
│        ├─ main_20260304221756.css
│        └─ main_20260304222635.css
├─ eslint.config.js
├─ index.html
├─ package-lock.json
├─ package.json
├─ public
│  ├─ dashboard.html
│  ├─ finance.html
│  ├─ gemini_echo.html
│  ├─ home.html
│  ├─ icon-512.png
│  ├─ lifenav.js
│  ├─ manifest.json
│  ├─ sw.js
│  ├─ vite.svg
│  └─ zpix.woff2
├─ README.md
├─ src
│  ├─ App.css
│  ├─ App.jsx
│  ├─ assets
│  │  └─ react.svg
│  ├─ components
│  │  ├─ CatBar.jsx
│  │  ├─ ConfirmModal.jsx
│  │  ├─ EditPanel.jsx
│  │  ├─ HUD.jsx
│  │  ├─ InvGrid.jsx
│  │  ├─ ManagePanel.jsx
│  │  ├─ MapCanvas.jsx
│  │  ├─ StatsModal.jsx
│  │  ├─ Toast.jsx
│  │  ├─ ZoneDetailModal.jsx
│  │  └─ ZoneNewModal.jsx
│  ├─ config.js
│  ├─ engine
│  │  └─ mapEngine.js
│  ├─ features
│  │  ├─ finance
│  │  │  ├─ components
│  │  │  │  ├─ Heatmap.jsx
│  │  │  │  ├─ KpiHud.jsx
│  │  │  │  ├─ RankingList.jsx
│  │  │  │  ├─ Sidebar.jsx
│  │  │  │  ├─ TimePills.jsx
│  │  │  │  ├─ Toast.jsx
│  │  │  │  └─ WordCloud.jsx
│  │  │  ├─ finance.css
│  │  │  ├─ hooks
│  │  │  │  ├─ useCharts.js
│  │  │  │  ├─ useClearData.js
│  │  │  │  ├─ useFinanceData.js
│  │  │  │  └─ useWxParser.js
│  │  │  ├─ index.jsx
│  │  │  ├─ pages
│  │  │  │  ├─ Assets.jsx
│  │  │  │  ├─ Dashboard.jsx
│  │  │  │  ├─ Details.jsx
│  │  │  │  └─ Journal.jsx
│  │  │  ├─ panels
│  │  │  │  ├─ CategoryModal.jsx
│  │  │  │  ├─ EditModal.jsx
│  │  │  │  ├─ ExportModal.jsx
│  │  │  │  ├─ QuickPanel.jsx
│  │  │  │  ├─ ReceiptModal.jsx
│  │  │  │  ├─ RuleModal.jsx
│  │  │  │  ├─ SubscriptionModal.jsx
│  │  │  │  └─ TransferModal.jsx
│  │  │  └─ utils
│  │  │     ├─ catMap.js
│  │  │     ├─ constants.js
│  │  │     └─ formatters.js
│  │  └─ wardrobe
│  │     ├─ components
│  │     │  ├─ AnnotateSection.jsx
│  │     │  ├─ CategorySection.jsx
│  │     │  ├─ ClosetSection.jsx
│  │     │  ├─ ImmersiveOverlay.jsx
│  │     │  ├─ KnowledgeSection.jsx
│  │     │  ├─ modals
│  │     │  │  ├─ ItemModal.jsx
│  │     │  │  ├─ NoteModal.jsx
│  │     │  │  ├─ TransferModal.jsx
│  │     │  │  ├─ TypeModal.jsx
│  │     │  │  └─ ZoneModal.jsx
│  │     │  ├─ StatsSection.jsx
│  │     │  ├─ WardrobeHeader.jsx
│  │     │  └─ WardrobeTabs.jsx
│  │     ├─ constants.js
│  │     ├─ hooks
│  │     │  └─ useWardrobeData.js
│  │     ├─ index.jsx
│  │     ├─ utils
│  │     │  └─ imageUtils.js
│  │     └─ wardrobe.css
│  ├─ firebase.js
│  ├─ index.css
│  ├─ main.jsx
│  ├─ styles
│  │  └─ main.css
│  └─ utils
│     └─ photo.js
└─ vite.config.js

```