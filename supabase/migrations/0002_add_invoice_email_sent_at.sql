-- 0002 — add transactions.invoice_email_sent_at.
--
-- Tracks whether the invoice receipt email has been delivered for a paid
-- transaction. Acts as an atomic idempotency token so the client-verify
-- path and the Razorpay webhook can't double-send.
--
-- Uses `add column if not exists` so it is safe on fresh DBs where the
-- column was already created by 0001_init.

alter table transactions
  add column if not exists invoice_email_sent_at timestamptz;
