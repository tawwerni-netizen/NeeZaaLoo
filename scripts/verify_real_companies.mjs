import fs from 'fs';
import dns from 'dns/promises';

async function main() {
    const text = fs.readFileSync('deliverables/200_institutional_buyers_emails.md', 'utf8');
    const emailMatches = text.match(/`([a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))`/g) || [];
    console.log(`Found ${emailMatches.length} raw email mentions in 200_institutional_buyers_emails.md`);

    const domains = new Set();
    for (const m of emailMatches) {
        const clean = m.replace(/`/g, '').trim();
        const parts = clean.split('@');
        if (parts.length === 2) {
            domains.add(parts[1].toLowerCase());
        }
    }
    console.log(`Unique domains found: ${domains.size}`);

    let liveCount = 0;
    const liveDomains = [];
    const deadDomains = [];

    for (const domain of Array.from(domains)) {
        try {
            const mx = await dns.resolveMx(domain);
            if (mx && mx.length > 0) {
                liveCount++;
                liveDomains.push({ domain, mx: mx[0].exchange });
            } else {
                deadDomains.push(domain);
            }
        } catch (err) {
            deadDomains.push(domain);
        }
    }

    console.log(`\n========================================`);
    console.log(`✅ Live, Active MX Domains: ${liveCount} / ${domains.size}`);
    console.log(`❌ Dead / Non-existent Domains: ${deadDomains.length}`);
    console.log(`========================================\n`);

    console.log('Sample Live Domains with Mail Exchangers:');
    liveDomains.slice(0, 20).forEach(d => console.log(`• ${d.domain} -> ${d.mx}`));
}

main().catch(console.error);
