# Product-Data-Analyzer
En fullstack-applikation som tar produktfeeds via API eller maskininläsningsformat (JSON/XML/CSV), jämför nuvarande priser för produkter av ens företag och visas på en dashboard. Produktbeskrivningar, prishistorik och mer finns.


## Projektet består av två huvuddelar:

### Dashboard
#### Frontend byggd i React som visar produkter, prisjämförelser och historik i ett tydligt gränssnitt.

### Backend

#### Backend byggd i Spring Boot som hanterar datainsamling, bearbetning, matchning och API-logik.

##### Systemarkitektur
Frontend kommunicerar med backend via REST-API. Backend hämtar data från interna filer och externa källor, bearbetar den och returnerar strukturerad JSON som frontend visualiserar.

##### Syfte
Syftet med projektet är att automatisera delar av processen kring produktanalys och prissättning. Istället för manuella kontroller kan systemet samla information, jämföra priser och presentera resultatet i ett gränssnitt som gör analysen snabbare och mer tillförlitlig.

##### Nuvarande funktioner
Visning av produkter
Prisjämförelse mellan marknadspris och eget pris.
Graf över prishistorik
Periodfilter för historik
Stabil datamodell med stöd för flera datakällor

##### Planerade förbättringar
Möjlighet att ändra produktpris direkt i dashboarden
Integration av fler datakällor och API-tjänster
Mer avancerad analys och rekommendationer
Databasstöd istället för enbart filbaserad data

#### Tekniker
Java 21,
Spring Boot,
React,
Vite,
REST API

#### Projektet är uppbyggt modulärt så att nya datakällor, funktioner och analysmetoder enkelt kan läggas till utan att ändra systemets grundstruktur.