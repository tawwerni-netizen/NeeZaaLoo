-- =============================================================================
-- 0056_normalize_tron_network_label.sql
--
-- "TRC20" is what the wallet shows. "TRON" is the chain the Tron verifier
-- answers for, and the key every payment_rail row and custody account uses.
--
-- The website withdrawal route stored the raw label, so every withdrawal a
-- player requested was filed under "TRC20". reconcile() hands that value to
-- chain.verifyTransfer(), which refuses any network but its own -- so each of
-- those payouts came back WRONG_NETWORK from its own chain and sat in
-- BROADCASTED forever: sent by the provider, the player's funds still
-- locked, the ledger never settled. The same label on a deposit row sends
-- verifyIncoming() the same way, quarantining a real payment.
--
-- The route now stores "TRON". This corrects rows written before that.
-- network is not one of the fields withdrawal_guard() freezes (amount,
-- destination, owner, fee, tx hash), and it is the same chain either way:
-- a label, not a payload change.
--
-- The one constraint it could touch is withdrawal_one_tx_per_payout
-- UNIQUE (network, tx_hash); a row is skipped rather than collide, so this
-- can never fail a deploy. Any skipped row is left for a human to look at.
-- =============================================================================

DO $$
DECLARE
  v_withdrawals INT;
  v_deposits    INT;
  v_skipped     INT;
BEGIN
  UPDATE withdrawal w
     SET network = 'TRON'
   WHERE w.network = 'TRC20'
     AND (w.tx_hash IS NULL OR NOT EXISTS (
           SELECT 1 FROM withdrawal o
            WHERE o.network = 'TRON' AND o.tx_hash = w.tx_hash AND o.id <> w.id));
  GET DIAGNOSTICS v_withdrawals = ROW_COUNT;

  SELECT count(*) INTO v_skipped FROM withdrawal WHERE network = 'TRC20';

  UPDATE deposit SET network = 'TRON' WHERE network = 'TRC20';
  GET DIAGNOSTICS v_deposits = ROW_COUNT;

  RAISE NOTICE '0056: normalized % withdrawal(s) and % deposit(s) from TRC20 to TRON; % withdrawal(s) skipped on a tx_hash collision',
    v_withdrawals, v_deposits, v_skipped;
END;
$$;
