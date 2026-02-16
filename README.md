# Product-Data-Analyzer

![Java](https://img.shields.io/badge/Java-21-007396?style=for-the-badge\&logo=java\&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.x-6DB33F?style=for-the-badge\&logo=springboot\&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge\&logo=react\&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge\&logo=vite\&logoColor=white)
![REST API](https://img.shields.io/badge/API-REST-FF6F00?style=for-the-badge)

![Preview](docs/screenshots/hero-preview.png)

**Product Data Analyzer** är en fullstack-applikation som analyserar produktdata och marknadspriser i realtid.
Systemet hämtar produktfeeds via API eller maskinläsbara format (JSON/XML/CSV), jämför priser mot marknadsdata och visualiserar resultatet i en interaktiv dashboard.

Projektet är designat som en **skalbar analysplattform** för e-handel, där syftet är att automatisera prissättning, produktanalys och marknadsinsikter.

---

# 🚀 Quick start (2 minuter)

### Backend

```bash
cd backend/price-comparer
gradlew.bat bootRun
```

Backend startar på:

```
http://localhost:3001
```

---

### Frontend

```bash
cd frontend/dashboard/client
npm install
npm run dev
```

Frontend startar på:

```
http://localhost:5173
```

---

### Environment setup

Skapa `.env` i:

```
frontend/dashboard/client/
```

med innehåll:

```
VITE_API_URL=http://localhost:3001
VITE_DASH_USER=admin
VITE_DASH_PASS=admin
```

---

# 🧱 Systemarkitektur

Frontend kommunicerar med backend via REST API.

```
React Dashboard
      ↓
Spring Boot API
      ↓
Data sources
(JSON/XML/API/CSV)
```

Backend ansvarar för:

* datainsamling
* normalisering
* matchning
* analys
* prissimulering

Frontend ansvarar för:

* visualisering
* interaktiv analys
* filter och historik
* användarinteraktion

---

# 📊 Funktioner

### Dashboard

* Produktlista med marknadsjämförelse
* Realtidsanalys av prisdifferenser
* Dynamisk visualisering
* Responsiv layout

### Analys

* Prisjämförelse mot marknad
* Historikgrafer
* Periodfilter
* Matchning via EAN / identifierare

### Backend-engine

* Stöd för flera datakällor
* Modulär parser-arkitektur
* Robust JSON-hantering
* REST-API för dashboard

---

# 💰 Pricing Engine (pågående modul)

Systemet är designat för att stödja både automatiska och manuella prisstrategier.

Planerad funktionalitet:

* rekommenderat pris baserat på marknadsmedian
* automatisk undercut-strategi (t.ex −2%)
* avrundningslogik (.90-pricing)
* manuellt override-läge per produkt
* audit-historik över prisändringar
* stöd för ML-baserade rekommendationer

Arkitekturen är byggd så att regelbaserad och ML-baserad prissättning kan samexistera utan att ändra API eller frontend.

---

# 🎯 Syfte

Målet är att automatisera manuella analyser inom e-handel.
Istället för att manuellt kontrollera konkurrentpriser kan systemet:

* samla data
* analysera marknaden
* föreslå optimala priser
* visualisera beslutstöd

---

# 🖥 Screenshots

<p align="center">
<img src="docs/screenshots/dashboard-overview.png" width="950">
</p>

<p align="center">
<img src="docs/screenshots/price-history-chart.png" width="950">
</p>

<p align="center">
<img src="docs/screenshots/comparison-table.png" width="950">
</p>

<p align="center">
<img src="docs/screenshots/product-drawer.png" width="950">
</p>

---

# 🧠 Arkitekturprincip

Projektet är uppbyggt modulärt enligt principen:

> **Nya funktioner ska kunna läggas till utan att ändra existerande systemlogik**

Det innebär att nya datakällor, analysmotorer eller prissättningsstrategier kan implementeras som separata moduler.

---

# 🔮 Roadmap

Planerade förbättringar:

* direkt prisändring i dashboard
* fler datakällor
* ML-baserad prissimulering
* databasstöd
* multi-tenant-stöd
* notifieringar vid prisförändringar

---

# 🧩 Designfilosofi

Projektet är byggt enligt riktlinjer inspirerade av enterprise-system:

* separerad logik
* tydlig API-struktur
* modulär arkitektur
* skalbar datamodell
* framtidssäker design

---

# 👨‍💻 Användningsområden

Systemet kan användas för:

* e-handelsanalys
* prisövervakning
* marknadsjämförelser
* beslutsstöd
* intern BI-visualisering

---

# 📄 Licens

MIT License
