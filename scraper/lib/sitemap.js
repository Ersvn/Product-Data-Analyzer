const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const RAW_DIR = path.join(__dirname, '../raw_sitemaps');
const CACHE_FILE = path.join(__dirname, '../cache/komplett_links.json');

async function getProductLinks(limit = 10) {
    // 1. Om vi redan har filtrerat till JSON, använd den (blixtsnabbt)
    if (fs.existsSync(CACHE_FILE)) {
        console.log('📦 Laddar produkter från lokal JSON-cache...');
        const cachedLinks = JSON.parse(fs.readFileSync(CACHE_FILE));
        return cachedLinks.sort(() => 0.5 - Math.random()).slice(0, limit);
    }

    console.log(`📂 Ingen cache hittad. Läser lokala XML-filer från ${RAW_DIR}...`);

    try {
        if (!fs.existsSync(RAW_DIR)) {
            throw new Error(`Mappen ${RAW_DIR} saknas! Skapa den och lägg dina XML-filer där.`);
        }

        const parser = new XMLParser();
        let allItLinks = [];

        // Läs alla XML-filer i mappen
        const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.xml'));

        for (const file of files) {
            console.log(`  📄 Parsar lokala filen: ${file}`);
            const xmlData = fs.readFileSync(path.join(RAW_DIR, file), 'utf-8');
            const jObj = parser.parse(xmlData);

            const urls = jObj.urlset?.url;
            if (urls) {
                const links = Array.isArray(urls) ? urls.map(u => u.loc) : [urls.loc];
                // Filtrera som tidigare
                const filtered = links.filter(l =>
                    /gaming|datautrustning|tv-ljud-bild/i.test(l) &&
                    !/koksapparater|vitvaror|personvard|hem-fritid/i.test(l)
                );
                allItLinks = allItLinks.concat(filtered);
            }
        }

        // Spara ner resultatet till JSON-cache så vi slipper parsa XML nästa gång
        if (!fs.existsSync(path.dirname(CACHE_FILE))) fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(allItLinks));

        console.log(`✅ JSON-cache skapad med ${allItLinks.length} IT-produkter.`);
        return allItLinks.sort(() => 0.5 - Math.random()).slice(0, limit);

    } catch (error) {
        console.error('❌ Fel vid lokal parsing:', error.message);
        return [];
    }
}

module.exports = { getProductLinks };