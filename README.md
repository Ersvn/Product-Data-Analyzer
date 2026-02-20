# Product-Data-Analyzer

![Java](https://img.shields.io/badge/Java-21-007396?style=for-the-badge\&logo=java\&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.x-6DB33F?style=for-the-badge\&logo=springboot\&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge\&logo=react\&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge\&logo=vite\&logoColor=white)
![REST API](https://img.shields.io/badge/API-REST-FF6F00?style=for-the-badge)

![Preview](docs/screenshots/hero-preview.png)

**Product Data Analyzer** är en fullstack-plattform för realtidsanalys av produktdata och marknadspriser.
Systemet analyserar produktfeeds (JSON/XML/API/CSV), matchar produkter via identifierare och genererar beslutsstöd för prissättning i en interaktiv dashboard.

Projektet är designat som en **skalbar analys- och pricing-engine för e-handel** där fokus ligger på automation, datakvalitet och beslutsstöd.

---

# 🚀 Quick start (2 minuter)

### Backend

```
cd backend/price-comparer
gradlew.bat bootRun
```

Backend startar på:

```
http://localhost:3001
```

---

### Frontend

```
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

```
VITE_API_URL=http://localhost:3001
VITE_DASH_USER=admin
VITE_DASH_PASS=change-me
```

---

# 🧱 Systemarkitektur

```
React Dashboard
      ↓
Spring Boot API
      ↓
Data sources
(JSON/XML/API/CSV)
```

### Backend ansvarar för

* datainsamling
* normalisering
* matchning via EAN
* prisanalys
* pricing-rekommendationer
* API-exponering

### Frontend ansvarar för

* visualisering
* realtidsanalys
* filter / sök
* produktdetaljer
* pricing-kontroller

---

# 📊 Funktioner

## Dashboard

* Virtualized produktlista (snabb även med stora dataset)
* Dynamisk sökning
* Pagination + infinite loading
* Drawer-baserad produktvy
* Prishistorikgrafer

## Analysmotor

* Marknadspris vs eget pris
* Matchning via EAN
* Prisintervall-stöd
* Historikfilter

## Data Engine

* Multi-source ingestion
* Automatisk normalisering
* Robust parserlogik
* Fel-tolerant datahantering

---

# 💰 Pricing Engine (aktiv modul)

Systemet stödjer nu både automatiska och manuella prisstrategier.

### Implementerat

* AUTO-läge → systemet räknar rekommenderat pris

* MANUAL-läge → användaren sätter pris själv

* Effektivt pris beräknas dynamiskt:

  ```
  MANUAL → manualPrice
  annars → recommendedPrice
  annars → fallback price
  ```

* Medianbaserad rekommendation

* Undercut-strategi (−2%)

* Smart avrundning (.90 pricing)

* Realtids-API för prissättning

---

### Pricing API

```
GET  /api/company/products/{id}/pricing
PUT  /api/company/products/{id}/pricing/manual
PUT  /api/company/products/{id}/pricing/mode
POST /api/company/products/{id}/pricing/recompute
```

Alla write-endpoints kräver Basic Auth.

---

# 🔐 Säkerhet

Backend skyddas med:

* Spring Security
* Basic Auth
* CORS whitelist
* Request filtering

---

# 🎯 Syfte

Målet är att ersätta manuella prisanalyser med automatiserad beslutslogik.

Systemet kan:

* analysera marknadspris
* identifiera prisskillnader
* föreslå optimala priser
* visualisera beslutsstöd

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

Projektet är byggt enligt principen:

> **Extensibility without modification**

Det innebär att nya datakällor, analysmotorer eller pricingstrategier kan läggas till utan att ändra existerande logik.

---

# 🔮 Roadmap

Nästa planerade steg:

### Kort sikt

* persistens av manuella priser
* audit log
* bulk-pricing actions
* pricing rules config

### Medellång sikt

* ML-baserad pricing-modell
* multi-tenant-stöd
* databaslager
* webhook-notifieringar

### Lång sikt

* SaaS-version
* plugin-system
* real-time competitor scraping
* pricing automation engine

---

# 🧩 Designfilosofi

Arkitekturen följer enterprise-principer:

* modulär struktur
* separerad domänlogik
* testbar service-layer
* tydlig API-struktur
* framtidssäker design

---

# 👨‍💻 Användningsområden

Systemet kan användas för:

* e-handelsanalys
* pricing automation
* konkurrensbevakning
* beslutsstöd
* intern BI
* marknadsanalys

---

# 📄 Licens

MIT License
