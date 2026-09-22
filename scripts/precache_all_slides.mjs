import fs from 'fs';

async function precache() {
  console.log('Fetching slide deck from server...');
  const res = await fetch('http://localhost:8788/');
  const html = await res.text();
  const start = html.indexOf('const ALL_SLIDES = ') + 'const ALL_SLIDES = '.length;
  const end = html.indexOf(';\n\n  let currentTool', start);
  const slides = JSON.parse(html.substring(start, end));

  console.log(`Found ${slides.length} slides to pre-cache with Journey David...`);

  let count = 0;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const text = s.narration;
    try {
      process.stdout.write(`[${i+1}/${slides.length}] Caching: ${s.fileName.slice(0, 30)}... `);
      const r = await fetch('http://localhost:8788/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideIndex: i,
          text: text,
          voiceId: 'journey-d'
        })
      });
      const data = await r.json();
      console.log(`OK (${data.mode}, cached=${data.cached})`);
      count++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
  console.log(`Pre-caching complete! Successfully cached ${count}/${slides.length} slides.`);
}

precache();
