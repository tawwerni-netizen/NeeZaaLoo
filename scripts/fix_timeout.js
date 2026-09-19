const fs = require('fs');
let text = fs.readFileSync('packages/realtime/src/gateway.mjs', 'utf8');

const claimOld = `    if (duel.status === DuelState.READY) {
      await store.markLive(duel, now());
      start(duel, now());
    }`;

const claimNew = `    if (duel.status === DuelState.READY) {
      if (duel.vsComputer) {
        await store.markLive(duel, now());
        start(duel, now());
      }
    }`;

text = text.replace(claimOld, claimNew);

const joinOld = `            if (!duel.vsComputer && duel.events.length === 0 && !wasBothConnected && nowBothConnected) {
              if (duel.clock.model === "SHARED") duel.clock.startedAt = t;
              else duel.clock.turnStartedAt = t;
              duel.startedAt = t;
            }`;

const joinNew = `            if (!duel.vsComputer && duel.events.length === 0 && !wasBothConnected && nowBothConnected) {
              if (duel.status === DuelState.READY) {
                duel.status = DuelState.LIVE;
                start(duel, t);
                store.markLive(duel, t).catch(console.error);
                
                // Broadcast to both players that the game has started!
                const syncMsg = JSON.stringify({ type: ServerMsg.DUEL_SYNC, payload: { ...duel, clock: projectClock(duel, t) } });
                for (const seats of duel.seatConns) {
                  for (const c of seats) {
                    if (c.socket.readyState === c.socket.OPEN) c.socket.send(syncMsg);
                  }
                }
              }
            }`;

text = text.replace(joinOld, joinNew);

fs.writeFileSync('packages/realtime/src/gateway.mjs', text);
