# Price Spider v9 - Deduplication Edition 🕷️

En robust, asynkron pris-scraper med **avancerad deduplicering** för Komplett, Dustin och Webhallen.

## 🎯 Dedupliceringslogik (NYTT!)

Scrapern använder en sofistikerad 4-stegs matchningsprocess:

### 1. EAN-matchning (högsta prioritet)
```
Om EAN finns och matchar befintlig produkt → Uppdatera den
```
- EAN är den mest tillförlitliga identifieraren
- Om samma EAN hittas på flera URLs → alla mappas till samma produkt

### 2. MPN + Brand matchning
```
Om EAN saknas men MPN + Brand matchar → Uppdatera försiktigt
```
- Används när produkten saknar EAN (vissa produkter har bara MPN)
- Kräver BÅDE MPN och Brand för att undvika falska positiva

### 3. URL-uppdatering
```
Om URL ändrats men EAN är samma → Uppdatera URL
```
- Butiker ändrar ibland URL-struktur
- Samma EAN = samma produkt, ny URL

### 4. Misstänkt produktbyte-detektion
```
Om URL är samma men EAN plötsligt ändrats → Markera som misstänkt
```
- **Detta är en VARNING, inte en uppdatering!**
- Kan betyda:
  - Produktbytte på samma URL (t.ex. ny årsmodell)
  - Felaktig data från butiken
  - Scraper-fel
- Kräver manuell granskning

## 🗄️ Databasstruktur

### products (Master-tabell)
```sql
- id (PK)
- ean (UNIQUE, nullable)
- mpn + brand (composite identifier)
- name
- category
- created_at / updated_at
```

### product_urls (URL-mapping)
```sql
- id (PK)
- product_id (FK)
- url (UNIQUE)
- site_name
- is_active
- last_scraped
```
**Varför separat tabell?**
- En produkt kan ha flera URLs (olika butiker)
- URLs kan ändras över tid
- Aktivera/avaktivera scraping per URL

### price_history (Full historik)
```sql
- id (PK)
- product_id (FK)
- price
- scraped_at
- source_url / source_site
- scrape_batch_id
```
**Varför full historik?**
- Spåra prisförändringar över tid
- Analys av pris-trender
- Debugga scrape-problem

### suspected_changes (Misstänkta byten)
```sql
- id (PK)
- original_product_id / original_ean / original_mpn
- new_ean / new_mpn / new_name / new_price
- source_url
- status: pending | confirmed_change | false_positive | merged
- detected_at / resolved_at
```

## 🚀 Snabbstart

### 1. Installera databasen
```bash
psql -U postgres -d price_engine -f setup-db-v2.sql
```

### 2. Konfigurera miljövariabler
```bash
cp .env.example .env
# Redigera .env
```

### 3. Installera dependencies
```bash
npm install
```

### 4. Kör scrapern
```bash
node main-v2.js
```

## 📊 Användning

### Starta full scrape
```bash
node main-v2.js
```

### Testa enstaka URL
```bash
# Bara visa data
node index-v2.js "https://www.komplett.se/product/123456"

# Spara till databas
node index-v2.js "https://www.komplett.se/product/123456" --save
```

### Kontrollera databasen
```bash
node check-db-v2.js
```

### Granska misstänkta byten
```bash
# Visa alla misstänkta byten
node check-db-v2.js

# Markera som bekräftat byte
node check-db-v2.js review 123 confirmed_change "Ny årsmodell"

# Markera som falskt positiv
node check-db-v2.js review 123 false_positive "Felaktig EAN i scrape"

# Slå ihop med existerande produkt
node check-db-v2.js review 123 merged "Samma produkt, ny EAN"
```

## 📈 Exempel-output

### Normal uppdatering
```
[Worker 1] [15/34] ✅ 4990kr | ASUS GeForce RTX... (updated)
```

### Ny produkt
```
[Worker 2] [3/25] 🆕 3290kr | MSI B550 Tomahawk (created)
```

### Misstänkt produktbyte
```
[Worker 1] [7/34] ⚠️ 5990kr | MISSTÄNKT PRODUKTBYTE: EAN ändrad fr...
```

### Sammanfattning
```
==================================================
  ✨ SKRAPNING SLUTFÖRD
==================================================
  📦 Totalt upptäckta URLs:    156
  ⏩ Skippade (cache):          89
  🆕 Nya produkter:             12
  ♻️  Uppdaterade:               21
  ⚠️  Misstänkta byten:          2
  ❌ Misslyckade:               1
  ⏱️  Tid:                       145.2s
  🚀 Hastighet:                 13.6 prod/min
==================================================

  ⚠️  VARNING: Misstänkta produktbyten upptäckta!
      Kör "node check-db-v2.js" för att granska.
```

## 🔍 Dashboard Output

```
======================================================================
  📊 PRICE SPIDER - DASHBOARD
======================================================================

📈 ÖVERSIKT
──────────────────────────────────────────────────────────────────────
   📦 Produkter:        1,247
   🔗 URLs:             1,389 (1,245 aktiva)
   💰 Pris-historik:    15,432 poster
   ⚠️  Väntande granskning: 3

🏪 PER BUTIK
──────────────────────────────────────────────────────────────────────
   Komplett     |  523 produkter | 523/530 aktiva URLs
   Dustin       |  412 produkter | 412/420 aktiva URLs
   Webhallen    |  312 produkter | 310/315 aktiva URLs

🆔 IDENTIFIERAR-STATISTIK
──────────────────────────────────────────────────────────────────────
   EAN:     1,180/1,247 (95%)
   MPN:     1,100/1,247 (88%)
   MPN-only: 67 produkter (saknar EAN)

⚠️  MISSTÄNKTA PRODUKTBYTEN (väntar på granskning)
──────────────────────────────────────────────────────────────────────

   #42 - Komplett
   URL: https://www.komplett.se/product/123456/asus-rtx-4070...
   ORIGINAL:  EAN=4711081324567, MPN=90YV0IW0-M0NA00
              ASUS GeForce RTX 4070 DUAL 12GB
   NYTT:      EAN=4711081329999, MPN=90YV0IW1-M0NA00
              ASUS GeForce RTX 4070 SUPER DUAL 12GB @ 6990 kr
   Upptäckt: 2024-03-27 14:32:15

   💡 För att granska: Uppdatera suspected_changes.status till:
      - "confirmed_change" = Bekräfta produktbyte
      - "false_positive" = Felaktig varning
      - "merged" = Slå ihop med existerande produkt
```

## 🛠️ Konfiguration

### Miljövariabler (.env)
```bash
# Database
DB_USER=postgres
DB_HOST=localhost
DB_NAME=price_engine
DB_PASSWORD=admin123
DB_PORT=5432

# Webshare Proxies
WEBSHARE_PROXY_1=http://user:pass@host:port
WEBSHARE_PROXY_2=http://user:pass@host:port

# Scraper Settings
CONCURRENT_WORKERS=3
PRODUCTS_PER_WORKER=50
CACHE_HOURS=24
REQUEST_DELAY_MIN_MS=1500
REQUEST_DELAY_MAX_MS=3000
MAX_RETRIES=3
```

## 🔄 Filstruktur

```
scraper/
├── main-v2.js           # Huvudprocess
├── worker-v2.js         # Worker thread
├── index-v2.js          # On-demand scraping
├── check-db-v2.js       # Dashboard
├── lib/
│   ├── browser.js       # Camoufox + proxies
│   └── db-v2.js         # Dedupliceringslogik
├── sites/
│   ├── komplett.js      # Komplett extractor
│   ├── dustin.js        # Dustin extractor
│   └── webhallen.js     # Webhallen extractor
├── setup-db-v2.sql      # Databas-schema
└── .env                 # Konfiguration
```

## 📝 Viktiga Skillnader från v8

| Funktion | v8 | v9 Deduplication |
|----------|----|------------------|
| Tabell | `scraped_products` | `products` + `product_urls` + `price_history` |
| Matchning | URL-baserad | EAN/MPN-baserad |
| Produktbyte | Uppdaterar tyst | Varning + manuell granskning |
| Prishistorik | Senaste pris | Full historik |
| Multi-URL | Separata rader | En produkt, flera URLs |

## 🐛 Felsökning

### "EAN ändrad från X till Y" varningar
Detta är **förväntat beteende**! Det betyder att:
1. Butiken har bytt produkt på samma URL
2. Eller att scrapern hittade fel EAN

**Åtgärd:**
```bash
# Granska och beslut
node check-db-v2.js review <id> confirmed_change "Ny årsmodell"
```

### Dubletter i databasen
Om samma produkt finns flera gånger:
1. Kolla EAN - är de olika?
2. Om samma EAN → manuell merge behövs
3. Om olika EAN → kan vara olika varianter

### Pris uppdateras inte
1. Kolla `product_urls.last_scraped`
2. Om nyligen → cache kan vara aktiv
3. Justera `CACHE_HOURS` i konfigurationen

## 🎯 Prestanda

| Mått | Resultat |
|------|----------|
| Deduplicering | 95%+ EAN-matchning |
| Falska positiva | <2% |
| Misstänkta byten | ~5% av URL-ändringar |
| Batch-storlek | 50 produkter/worker |
| Hastighet | ~15 prod/min (3 workers) |

## 📚 SQL för Analys

### Hitta produkter utan EAN
```sql
SELECT * FROM products WHERE ean IS NULL;
```

### Hitta produkter med flera URLs
```sql
SELECT product_id, COUNT(*) as url_count
FROM product_urls
GROUP BY product_id
HAVING COUNT(*) > 1;
```

### Pris-trender
```sql
SELECT 
    p.name,
    MIN(ph.price) as lowest_price,
    MAX(ph.price) as highest_price,
    AVG(ph.price)::INTEGER as avg_price
FROM products p
JOIN price_history ph ON ph.product_id = p.id
WHERE ph.scraped_at > NOW() - INTERVAL '30 days'
GROUP BY p.id;
```

### Misstänkta byten per butik
```sql
SELECT 
    source_site,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'pending') as pending
FROM suspected_changes
GROUP BY source_site;
```
