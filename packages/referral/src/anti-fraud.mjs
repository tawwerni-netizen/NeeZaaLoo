/**
 * Anti-Fraud & Risk Assessment for Referral Attributions & Rewards.
 *
 * Rules:
 *  1. Never one signal = ban. Scores aggregate evidence into cases.
 *  2. Self-referrals and circular referrals are rejected structurally.
 *  3. Shared IP alone is NEVER sufficient to reject a legitimate household.
 *  4. Device matches, deposit address loops, and velocity spikes raise risk score.
 */

export async function evaluateReferralRisk(db, { referrerId, referredId, depositId }) {
  const reasons = [];
  let riskScore = 0;

  // 1. Check for Circular Attribution Graph (A -> B -> A, etc.)
  const cycleQuery = await db.query(
    `WITH RECURSIVE referral_graph AS (
       SELECT referrer_player_id, referred_player_id, 1 as depth
       FROM referral_attribution
       WHERE referred_player_id = $1
       UNION ALL
       SELECT a.referrer_player_id, a.referred_player_id, g.depth + 1
       FROM referral_attribution a
       JOIN referral_graph g ON a.referred_player_id = g.referrer_player_id
       WHERE g.depth < 10
     )
     SELECT depth FROM referral_graph WHERE referrer_player_id = $2`,
    [referrerId, referredId]
  );

  if (cycleQuery.rows.length > 0) {
    riskScore += 100;
    reasons.push("CIRCULAR_REFERRAL_CYCLE_DETECTED");
  }

  // 2. Check for On-Chain Funding Source Overlap
  // If the deposit on the referred account came from the exact same tx from_address or observed_tx_hash
  if (depositId) {
    const depositOverlap = await db.query(
      `SELECT d1.id as referred_dep, d2.id as referrer_dep
       FROM deposit d1
       JOIN deposit d2 ON d1.observed_tx_hash IS NOT NULL 
                      AND d1.observed_tx_hash = d2.observed_tx_hash
                      AND d2.player_id = $1
       WHERE d1.id = $2`,
      [referrerId, depositId]
    );

    if (depositOverlap.rows.length > 0) {
      riskScore += 80;
      reasons.push("SHARED_DEPOSIT_SOURCE_OVERLAP");
    }
  }

  // 3. Check for Referrer Velocity Spikes (>10 attributed signups within 1 hour)
  const velocityQuery = await db.query(
    `SELECT COUNT(*)::int as count_1h
     FROM referral_attribution
     WHERE referrer_player_id = $1
       AND attributed_at >= NOW() - INTERVAL '1 hour'`,
    [referrerId]
  );

  const count1h = velocityQuery.rows[0]?.count_1h ?? 0;
  if (count1h > 10) {
    riskScore += 40;
    reasons.push("HIGH_ATTRIBUTION_VELOCITY");
  }

  // 4. Shared Device / Fingerprint Overlap
  const deviceQuery = await db.query(
    `SELECT d1.fingerprint
     FROM device d1
     JOIN device d2 ON d1.fingerprint = d2.fingerprint AND d2.player_id = $1
     WHERE d1.player_id = $2
     LIMIT 1`,
    [referrerId, referredId]
  );

  if (deviceQuery.rows.length > 0) {
    riskScore += 50;
    reasons.push("SHARED_DEVICE_FINGERPRINT");
  }

  // 5. Shared IP (Observed as minor context, never auto-block alone)
  const ipQuery = await db.query(
    `SELECT s1.ip
     FROM auth_session s1
     JOIN auth_session s2 ON s1.ip IS NOT NULL 
                        AND s1.ip = s2.ip 
                        AND s2.player_id = $1
     WHERE s1.player_id = $2
     LIMIT 1`,
    [referrerId, referredId]
  );

  if (ipQuery.rows.length > 0) {
    // Adds only 10 points - strictly insufficient to block by itself
    riskScore += 10;
    reasons.push("SHARED_IP_HOUSEHOLD_OBSERVED");
  }

  return {
    score: Math.min(riskScore, 100),
    reasons,
    isHighRisk: riskScore >= 50,
    isTerminalFraud: riskScore >= 90,
  };
}
