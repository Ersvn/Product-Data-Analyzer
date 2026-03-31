# Migration Guide: v8 → v9 Deduplication

## Snabbstart

### 1. Installera ny databasstruktur
```bash
psql -U postgres -d price_engine -f setup-db-v2.sql
```

### 2. Använd nya filerna
| Gammal fil | Ny fil |
|------------|--------|
| `main.js` | `main-v2.js` |
| `worker.js` | `worker-v2.js` |
| `lib/db.js` | `lib/db-v2.js` |
| `index.js` | `index-v2.js` |
| `check-db.js` | `check-db-v2.js` |
| `setup-db.sql` | `setup-db-v2.sql` |

### 3. Uppdatera package.json
```json
{
  "scripts": {
    "start": "node main-v2.js",
    "test": "node index-v2.js",
    "check-db": "node check-db-v2.js"
  }
}
```

## Vad är nytt?

### Deduplicering
- **EAN-matchning**: Primär identifierare
- **MPN+Brand**: Sekundär identifierare (när EAN saknas)
- **URL-tracking**: Spårar URL-ändringar
- **Misstänkta byten**: Varning när EAN ändras på samma URL

### Nya tabeller
```
products          ← Master-produkter (unika på EAN/MPN+Brand)
product_urls      ← URL-mapping till products
price_history     ← Full pris-historik
suspected_changes ← Misstänkta produktbyten
scrape_logs       ← Detaljerad logg
```

### Skillnader från v8
| v8 | v9 |
|----|-----|
| `scraped_products` (en tabell) | `products` + `product_urls` + `price_history` |
| URL = unik nyckel | EAN/MPN = unika nycklar |
| Uppdaterar alltid | Varnar vid produktbyte |
| Senaste pris | Full historik |

## Exempel på användning

### Scrape och spara
```bash
node main-v2.js
```

### Kontrollera resultat
```bash
node check-db-v2.js
```

### Granska misstänkta byten
```bash
# Visa alla
node check-db-v2.js

# Markera som bekräftat
node check-db-v2.js review 42 confirmed_change "Ny årsmodell"

# Markera som falskt positiv
node check-db-v2.js review 42 false_positive "Felaktig EAN"
```

## Vanliga frågor

### Q: Kan jag behålla gamla data?
**A:** Ja, men du behöver migrera den. Kör:
```sql
INSERT INTO products (ean, mpn, name, created_at, updated_at)
SELECT DISTINCT ON (ean) 
    ean, mpn, name, MIN(created_at), MAX(last_scraped)
FROM scraped_products
WHERE ean IS NOT NULL
GROUP BY ean, mpn, name;
```

### Q: Vad händer med produkter utan EAN?
**A:** De matchas på MPN+Brand. Om ingen matchning hittas skapas en ny produkt.

### Q: Hur ofta kommer "misstänkta byten"?
**A:** Vanligtvis <5% av scrape-runs. De flesta är:
- Ny årsmodell på samma URL
- Butiken bytt leverantör
- Felaktig EAN i scrape (sällsynt)

### Q: Kan jag stänga av deduplicering?
**A:** Nej, det är kärnfunktionen. Men du kan justera `CACHE_HOURS` för att scrape oftare.

## Felsökning

### "Misstänkt produktbyte" varningar
Detta är **förväntat**! Granska och beslut:
```bash
node check-db-v2.js review <id> <beslut>
```

### Dubletter i databasen
Kolla om de har olika EAN:
```sql
SELECT ean, COUNT(*) 
FROM products 
GROUP BY ean 
HAVING COUNT(*) > 1;
```

### Pris uppdateras inte
Kolla cache-tiden:
```sql
SELECT url, last_scraped 
FROM product_urls 
ORDER BY last_scraped DESC 
LIMIT 10;
```
