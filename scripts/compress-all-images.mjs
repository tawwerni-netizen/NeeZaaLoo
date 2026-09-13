import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const IMAGES_DIR = path.resolve(here, '../apps/web/public/images');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

async function main() {
  const allFiles = getAllFiles(IMAGES_DIR);
  const imageFiles = allFiles.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  
  console.log(`Found ${imageFiles.length} images to optimize.`);
  let totalOrigBytes = 0;
  let totalNewBytes = 0;
  let webpCreated = 0;

  for (const file of imageFiles) {
    const origStat = fs.statSync(file);
    const origBytes = origStat.size;
    totalOrigBytes += origBytes;

    const ext = path.extname(file).toLowerCase();
    const webpPath = file.replace(/\.(jpg|jpeg|png)$/i, '.webp');

    try {
      // Read into buffer first to prevent Windows file locking
      const inputBuffer = fs.readFileSync(file);
      const meta = await sharp(inputBuffer).metadata();

      const isHero = file.includes('hero-showcase');
      const isBannerOrTourn = file.includes('tournaments') || file.includes('banners');
      const maxWidth = isHero ? 1280 : isBannerOrTourn ? 1200 : 800;
      const shouldResize = meta.width && meta.width > maxWidth;

      // 1. Optimize original JPG/PNG in-place
      let pipeline = sharp(inputBuffer);
      if (shouldResize) {
        pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
      }

      let optimizedBuf;
      if (ext === '.jpg' || ext === '.jpeg') {
        optimizedBuf = await pipeline
          .jpeg({ quality: 78, mozjpeg: true, progressive: true })
          .toBuffer();
      } else if (ext === '.png') {
        optimizedBuf = await pipeline
          .png({ quality: 82, compressionLevel: 9, effort: 7 })
          .toBuffer();
      }

      if (optimizedBuf && optimizedBuf.length < origBytes) {
        fs.writeFileSync(file, optimizedBuf);
        totalNewBytes += optimizedBuf.length;
        const savedPercent = ((origBytes - optimizedBuf.length) / origBytes * 100).toFixed(1);
        console.log(`[OPT] ${path.relative(IMAGES_DIR, file)}: ${(origBytes/1024).toFixed(1)}KB -> ${(optimizedBuf.length/1024).toFixed(1)}KB (${savedPercent}% saved)`);
      } else {
        totalNewBytes += origBytes;
      }

      // 2. Generate modern WebP sibling
      let webpPipeline = sharp(inputBuffer);
      if (shouldResize) {
        webpPipeline = webpPipeline.resize({ width: maxWidth, withoutEnlargement: true });
      }
      const webpBuf = await webpPipeline
        .webp({ quality: 78, effort: 6 })
        .toBuffer();
      fs.writeFileSync(webpPath, webpBuf);
      webpCreated++;
      console.log(`[WEBP] Created ${path.relative(IMAGES_DIR, webpPath)} (${(webpBuf.length/1024).toFixed(1)}KB)`);

    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
      totalNewBytes += origBytes;
    }
  }

  console.log('==================================================');
  console.log(`Total original size: ${(totalOrigBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total optimized size: ${(totalNewBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Bandwidth saved: ${((totalOrigBytes - totalNewBytes) / 1024 / 1024).toFixed(2)} MB (${((totalOrigBytes - totalNewBytes) / totalOrigBytes * 100).toFixed(1)}%)`);
  console.log(`Generated ${webpCreated} modern WebP sibling files.`);
}

main();
