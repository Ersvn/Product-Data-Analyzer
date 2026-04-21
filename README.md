# Product-Data-Analyzer

![Java](https://img.shields.io/badge/Java-21-007396?style=for-the-badge&logo=java&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.x-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql&logoColor=white)

![Preview](docs/screenshots/overview.png)

**Product-Data-Analyzer** är ett examensprojekt byggt för att analysera egna produktpriser mot marknaden i en lokal dashboard.

Projektet består av:
- en **Spring Boot-backend**
- en **React/Vite-frontend**
- en separat **core pricing engine**
- en fristående **scraper-del** för att samla in marknadsdata

Fokus i nuläget är att:
- läsa in och visa eget sortiment från databasen
- jämföra produkter mot marknadsdata
- visa över-/underprissättning
- ge rekommenderade priser
- låta användaren växla mellan **AUTO** och **MANUAL**
- ge en enkel dashboard för överblick och åtgärder

---

# Översikt

Systemet arbetar i huvudsak med två dataperspektiv:

- **Our Inventory**
  Egna produkter från `company_listings`

- **Market**
  Marknadsdata från scrape:ade källor, aggregerat i `scraped_market_rollup`

Frontend visar detta i två huvudvyer:

- **Dashboard**
- **Products**

---

# Screenshots
![Overview](docs/screenshots/market.png)
![Products](docs/screenshots/our-inventory.png)
![Pricing](docs/screenshots/product-drawer.png)

---

# Nuvarande funktioner

## Dashboard
Dashboarden visar en snabb överblick över:
- antal matchade produkter
- antal överprissatta produkter
- antal underprissatta produkter
- antal outliers
- work queue för produkter som bör granskas

## Products
Products-vyn låter dig:
- växla mellan **Our Inventory** och **Market**
- söka i data
- scrolla igenom större datamängder
- öppna en produkt i drawer
- se market snapshot / erbjudanden
- justera prisläge på inventory-produkter

## Pricing
Projektet stödjer just nu:
- **AUTO**-läge
- **MANUAL**-läge
- rekommenderat pris baserat på market snapshot
- bulk-recompute för AUTO-produkter

---

# Teknisk struktur

## Backend
- Java 21
- Spring Boot
- Spring JDBC
- Spring Security
- PostgreSQL

## Frontend
- React 19
- Vite
- React Router
- Recharts installerat i frontend

## Core Engine
Den separata modulen `core-engine` innehåller pricing-logik och regler, till exempel:
- undercut-regler
- ignore-below-cost-regler
- post-processors som psykologisk prissättning

---

# Starta projektet

## Snabbaste sättet
I repo-roten finns ett PowerShell-script:

```powershell
.\start-dev.ps1
```
