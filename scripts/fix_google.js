const fs = require('fs');
let text = fs.readFileSync('apps/web/src/components/auth/GoogleOneTap.tsx', 'utf8');

const healthCallOld = `    get<{ googleLogin?: string }>("/v1/health")
      .then((res) => { if (live) setGoogleAvailable(res?.googleLogin === "configured"); })
      .catch(() => { if (live) setGoogleAvailable(false); });`;

const healthCallNew = `    get<{ googleLogin?: string }>("/v1/health")
      .then((res) => { if (live) setGoogleAvailable(res?.googleLogin === "configured" || !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID); })
      .catch(() => { if (live) setGoogleAvailable(!!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID); });`;

text = text.replace(healthCallOld, healthCallNew);

text = text.replace('if (!googleAvailable) return;', 'if (!googleAvailable && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return;');

fs.writeFileSync('apps/web/src/components/auth/GoogleOneTap.tsx', text);
