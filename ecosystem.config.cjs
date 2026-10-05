/**
 * PM2 Process Manager Configuration for Nizalo Unified Monolith.
 *
 * Runs the Next.js frontend, REST API, WebSocket Gateway, and Background Worker
 * unified in a single optimized Node.js process.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 restart nizalo-platform
 */
module.exports = {
  apps: [
    {
      name: "nizalo-platform",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      listen_timeout: 30000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
