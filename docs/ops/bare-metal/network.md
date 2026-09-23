<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Network, TLS, and Firewall Reference

Companion to `docs/ops/bare-metal-deploy.md` (§6). This file covers edge TLS, port allocation, firewall rules, and the small set of cross-node ports the loop-lore stack actually needs.

> Source-of-truth: `src/` + AGENTS.md. Treat the source code as authoritative; this file is operator reference.

---

## 1. Port Allocation

| Port | Proto | Service                    | Bind          | Public? |
| ---- | ----- | -------------------------- | ------------- | ------- |
| 22   | TCP   | SSH                        | `0.0.0.0`     | yes (CIDR-restricted) |
| 80   | TCP   | HTTP (ACME + redirect)     | edge          | yes     |
| 443  | TCP   | HTTPS                      | edge          | yes     |
| 3000 | TCP   | loop-lore Bun app          | `127.0.0.1`   | no (behind edge) |
| 5432 | TCP   | PostgreSQL                 | `127.0.0.1` or private VLAN | no |
| 6379 | TCP   | Redis (optional P5)        | private VLAN   | no      |
| 8081 | TCP   | llama-swap                 | `127.0.0.1`   | no      |
| 9100 | TCP   | prometheus-node-exporter   | private VLAN   | no      |
| 9187 | TCP   | pg-exporter                | private VLAN   | no      |

Anything not on this list should not be exposed. If a service isn't on the list, it isn't supported in this runbook.

---

## 2. Firewall (ufw) Rules

Single-server baseline:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <jump-host-cidr> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Multi-node additions (private VLAN only):

```bash
# Postgres app -> db
sudo ufw allow from <app-node-ip> to any port 5432 proto tcp
# Prometheus scrapers
sudo ufw allow from <prometheus-cidr> to any port 9100 proto tcp
sudo ufw allow from <prometheus-cidr> to any port 9187 proto tcp
```

Validate after every change: `sudo ufw status numbered` and a remote probe from outside the allowed CIDR.

---

## 3. Edge TLS

### 3.1 Caddy (recommended for single host)

`/etc/caddy/Caddyfile`:

```caddy
<domain> {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
```

Caddy handles ACME automatically. Reload with `sudo systemctl reload caddy`. Cert state: `/var/lib/caddy/.local/share/caddy/certificates/`.

### 3.2 nginx (alternative, when Caddy is not available)

`/etc/nginx/sites-available/loop-lore.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name <domain>;

    ssl_certificate     /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_buffering    off;
    }
}
server { listen 80; server_name <domain>; return 301 https://$host$request_uri; }
```

Cert issuance: `certbot --nginx -d <domain>`; renewal is automatic via the certbot timer.

### 3.3 Required app env behind TLS

```bash
SERVER_TRUST_PROXY=1
SERVER_PUBLIC_ORIGIN=https://<domain>
```

`SERVER_TRUST_PROXY=1` is required for `X-Forwarded-*` to be honored. `SERVER_PUBLIC_ORIGIN` is used for federation `nodeinfo` and self-referential URLs.

---

## 4. ACME Challenges

- **HTTP-01:** open inbound 80 from the Internet. The simplest option.
- **DNS-01:** required for wildcard certs or when 80 is blocked. Use the Caddy `dns` module or `certbot-dns-<provider>` plugins.
- **Staging first:** `acme-ca-test` lets you validate wiring without rate-limit hits before switching to production ACME.

---

## 5. Federation / Cross-Node

- **federation peers** (when `FEDERATION_ENABLED=true`): SPKI pin per peer (see `docs/spec/crypto.md`). Don't disable pinning.
- **Tor hidden service** (proposed, **not implemented** — no `ANONYMITY_MODE` setting exists in the app yet; see `epic-anonymity-decentralization.md`): when it ships, the hidden service key is expected to live in `/var/lib/tor/loop-lore/`, with the OnionAddress as the canonical user-facing URL in that mode.
- **internal node-to-node traffic** should ride the private VLAN. Bind Postgres / Redis / llama-swap only to the private interface or `127.0.0.1`.

---

## 6. Rate Limiting and WAF

Edge layer minimum:

- Per-IP token bucket: 60 req / 10 s sustained, burst 100 (Caddy `limit` matcher; nginx `limit_req_zone`).
- Sensitive routes (`/auth/*`, `/api/*`): tighter (10 req / 10 s).
- Optional ModSecurity WAF ruleset (OWASP CRS) on top of nginx for higher tiers.

Verify with `curl` from a remote host before declaring it shipped.

---

## 7. DNS

- A + AAAA records for the public hostname, low TTL during cut-over (300 s), restore to 3600 s once stable.
- `_acme-challenge.<domain>` CNAME when DNS-01 is in use.
- DNSSEC recommended at the registrar.
- For multi-node: a single public DNS name pointed at the edge; internal services resolved via split-horizon DNS or `/etc/hosts`.

---

## 8. Verification

```bash
# TLS chain + protocol
openssl s_client -connect <domain>:443 -tls1_2 -servername <domain> </dev/null 2>&1 | grep -E 'Protocol|Verify return code'

# HSTS / headers
curl -sI https://<domain> | grep -iE 'strict-transport|content-type-options|frame-options'

# Port scan from outside
nmap -sT -p 22,80,443 <public-ip>

# App health through TLS
curl -fsS https://<domain>/api/health
```

All four should pass before declaring the network tier ready. See §10 of `bare-metal-deploy.md` for the full checklist.

---

## 9. Change Log

- **2026-09-22:** Initial publication (TASK-002).
