-- SAKSI off-chain store: ciphertext and wrapped keys only. No plaintext, no names, no IPs.
-- Paste into Supabase → SQL Editor → New query → Run.

create table if not exists reports (
  commitment       text primary key,            -- keccak256(iv ‖ ciphertext ‖ salt), also on-chain
  report_id        bigint unique,               -- on-chain id, set once the tx is mined
  institution_id   text not null,               -- bytes32 hex, as on-chain
  iv               text not null,               -- base64
  ciphertext       text not null,               -- base64, AES-256-GCM
  wrapped_tf       jsonb not null,              -- report key wrapped for the task force (X25519 + HKDF + AES-GCM)
  wrapped_ministry jsonb,                       -- report key wrapped for the ministry, added on escalation
  tx_hash          text,
  created_at       timestamptz not null default now()
);

create table if not exists access_codes (
  code_hash      text primary key,              -- sha256 of the one-time code; codes are not linked to identity
  institution_id text not null,
  used_at        timestamptz
);

-- Row-level security on, no policies: only the server's service key can read or write.
alter table reports enable row level security;
alter table access_codes enable row level security;

-- Newer Supabase projects don't grant table access to the API roles automatically.
grant select, insert, update, delete on public.reports, public.access_codes to service_role;
