# Product-Data-Analyzer
![Java](https://img.shields.io/badge/Java-21-007396?style=for-the-badge&logo=java&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.x-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![REST API](https://img.shields.io/badge/API-REST-FF6F00?style=for-the-badge)


![Preview](docs/screenshots/hero-preview.png)

En fullstack-applikation som tar produktfeeds via API eller maskinläsningsformat (JSON/XML/CSV), jämför aktuella produktpriser mot marknadsdata och visualiserar resultatet i en interaktiv dashboard. Systemet visar produktinformation, prisdifferenser, historik och analys i realtid.

---

## Projektet består av två huvuddelar

### Dashboard
Frontend byggd i React som presenterar produkter, prisjämförelser och historik i ett tydligt och responsivt gränssnitt.

### Backend
Backend byggd i Spring Boot som hanterar datainsamling, bearbetning, matchning och API-logik.

---

## Systemarkitektur
Frontend kommunicerar med backend via REST-API. Backend hämtar data från interna filer och externa källor, bearbetar informationen och returnerar strukturerad JSON som frontend visualiserar.

---

## Syfte
Syftet med projektet är att automatisera delar av processen kring produktanalys och prissättning. Istället för manuella kontroller kan systemet samla information, jämföra priser och presentera resultatet i ett gränssnitt som gör analysen snabbare och mer tillförlitlig.

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/hero-preview.png" width="1000">
</p>

### Dashboard overview
<p align="center">
  <img src="docs/screenshots/dashboard-overview.png" width="950">
</p>

### Price history
<p align="center">
  <img src="docs/screenshots/price-history-chart.png" width="950">
</p>

### Comparison view
<p align="center">
  <img src="docs/screenshots/comparison-table.png" width="950">
</p>

### Product details
<p align="center">
  <img src="docs/screenshots/product-drawer.png" width="950">
</p>


---

## Nuvarande funktioner
- Visning av produkter
- Prisjämförelse mellan marknadspris och eget pris
- Graf över prishistorik
- Periodfilter för historik
- Stabil datamodell med stöd för flera datakällor

---

## Planerade förbättringar
- Möjlighet att ändra produktpris direkt i dashboarden
- Integration av fler datakällor och API-tjänster
- Mer avancerad analys och rekommendationer
- Databasstöd istället för enbart filbaserad data

---


## Arkitekturprincip
Projektet är uppbyggt modulärt så att nya datakällor, funktioner och analysmetoder enkelt kan läggas till utan att ändra systemets grundstruktur.
