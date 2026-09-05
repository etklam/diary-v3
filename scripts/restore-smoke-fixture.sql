BEGIN;
INSERT INTO users (email, password, name, role, timezone, locale)
VALUES
  ('restore-owner-60@example.test', '$2b$04$M3fF0A.Oe12wMl/wdM7f7epx9UiUW70oRpKHJtaeYxgwNDvVoMFo6', 'Synthetic owner', 'USER', 'Asia/Taipei', 'zh-TW'),
  ('restore-partner-60@example.test', 'synthetic-password-hash', 'Synthetic partner', 'USER', 'UTC', 'en');

INSERT INTO stocks (symbol, quote_symbol, name, exchange, currency)
VALUES ('R60', 'R60', 'Restore synthetic company', 'TEST', 'USD')
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO diaries (user_id, title, content, tags, date, thesis, risk, execution, review_due_at, review_status)
SELECT id, 'Restore decision', 'Synthetic decision body for the N backup.', ARRAY['restore','synthetic'], '2026-09-01', 'Demand may recover after the reset.', 'Recovery is not confirmed.', 'Wait for the next evidence point.', '2026-10-01T09:00:00Z', 'pending'
FROM users WHERE email = 'restore-owner-60@example.test';

INSERT INTO transactions (diary_id, user_id, symbol, type, quantity, price, trade_date, notes, strategy, emotion)
SELECT d.id, d.user_id, 'R60', 'BUY', 3.5000, 101.2500, '2026-09-01T10:00:00Z', 'Synthetic N backup transaction', 'evidence-first', 'calm'
FROM diaries d JOIN users u ON u.id = d.user_id
WHERE u.email = 'restore-owner-60@example.test' AND d.date = '2026-09-01';

INSERT INTO stock_notes (user_id, stock_id, title, content, date, created_via, created_by_label)
SELECT u.id, s.id, 'N research note', 'Synthetic research evidence retained through restore.', '2026-09-01T11:00:00Z', 'USER', 'restore-fixture'
FROM users u CROSS JOIN stocks s
WHERE u.email = 'restore-owner-60@example.test' AND s.symbol = 'R60';

INSERT INTO stock_timeline_records (user_id, stock_id, summary, source_type, source_title, source_diary_id, source_external_id, confidence, idempotency_key, occurred_at, created_via, created_by_label)
SELECT u.id, s.id, 'Synthetic timeline evidence', 'DIARY', 'Restore decision', d.id, 'restore-60-timeline', 80, 'restore-60-timeline-key', '2026-09-01T12:00:00Z', 'WEB', 'restore-fixture'
FROM users u CROSS JOIN stocks s JOIN diaries d ON d.user_id = u.id AND d.date = '2026-09-01'
WHERE u.email = 'restore-owner-60@example.test' AND s.symbol = 'R60';

INSERT INTO alerts (diary_id, message, trigger_at, recurring_mode)
SELECT d.id, 'Synthetic review reminder', '2026-10-01T09:00:00Z', 'MONTH'
FROM diaries d JOIN users u ON u.id = d.user_id
WHERE u.email = 'restore-owner-60@example.test' AND d.date = '2026-09-01';

INSERT INTO partner_links (user_a_id, user_b_id, initiated_by_user_id, accepted_at, user_a_shares_diaries, user_b_shares_diaries, user_a_shares_stock_notes, user_b_shares_stock_notes)
SELECT LEAST(owner.id, partner.id), GREATEST(owner.id, partner.id), owner.id, '2026-09-02T08:00:00Z', true, true, true, false
FROM users owner CROSS JOIN users partner
WHERE owner.email = 'restore-owner-60@example.test' AND partner.email = 'restore-partner-60@example.test';

INSERT INTO refresh_tokens (token, user_id, client_type, family_id, device_name, expires_at)
SELECT 'synthetic-refresh-token-60', id, 'WEB', 'synthetic-family-60', 'restore-browser', '2027-09-01T00:00:00Z'
FROM users WHERE email = 'restore-owner-60@example.test';
COMMIT;
