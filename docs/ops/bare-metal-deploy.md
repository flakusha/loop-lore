<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Bare-Metal Deployment Guide

**Ticket:** TASK-002-bare-metal-deployment-guide
**Target OS:** Ubuntu 22.04 LTS (Jammy Jellyfish)
**Audience:** Ops / Platform engineers provisioning on-prem or dedicated-server loop-lore instances.
**Scope:** Single-server (small/medium) and multi-node (database + app + GPU) topologies.
**Companion files:**
- `docs/ops/bare-metal/systemd/` - service unit files
- `docs/ops/bare-metal/requirements.txt` - pinned system/runtime packages
- `docs/ops/bare-metal/network.md` - firewall, TLS, port-forwarding

> **Authoritative source:** `src/` + AGENTS.md. This runbook is a deployment reference, not a current-state contract. Where it drifts from `src/`, treat the source code as correct and update this document.

---

## 1. Hardware Inventory

loop-lore is a Bun + Elysia + HTMX + Alpine.js stack with optional GPU inference. Sizing tiers follow the same P3 (dev) / P4 (steady) / P5 (peak burst) naming as `docs/infrastructure/gpu-requirements.md`.

### 1.1 Component matrix

| Tier            | CPU     | RAM    | System disk | Data disk (NVMe)   | GPU (optional)        | Network   |
| --------------- | ------- | ------ | ----------- | ------------------ | --------------------- | --------- |
| **P3 dev**      | 4 vCPU  | 8 GB   | 50 GB SSD   | 100 GB             | -                     | 1 Gbps    |
| **P4 steady**   | 8 vCPU  | 32 GB  | 100 GB NVMe | 1 TB NVMe RAID-1   | 1× RTX 4090 / A5000   | 1-10 Gbps |
| **P5 burst**    | 16 vCPU | 64 GB  | 100 GB NVMe | 2 TB NVMe RAID-1   | 1-2× A100 / H100      | 10 Gbps   |

### 1.2 CPU

- **P3/P4:** modern x86_64 with AVX2. AMD EPYC (Milan/Genoa) or Intel Xeon Scalable (Ice Lake or newer) recommended.
- **P5:** 16c/32t minimum; hyperthreading helps Bun's worker pool.
- Disable frequency scaling on long-running nodes: `performance` governor (`/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor`).

### 1.3 RAM

- ECC strongly recommended for any tier with persistent DB writes.
- **P5:** leave >=25 % headroom above expected load - Bun's SQLite cache and Postgres `shared_buffers` both grow under burst.

### 1.4 Storage

- **System:** 100 GB NVMe minimum. Install root here, separate from data.
- **Data:** NVMe, RAID-1 mirror (see §4). mdadm or ZFS mirror. Never RAID-0 on production data.
- **GPU models:** >= 100 GB free for the GGUF model cache plus prompt-cache scratch (`/var/lib/loop-lore/cache`).
- **IOPS budget:** Bun + SQLite is single-writer; target >=20k 4K random read IOPS. NVMe class easily exceeds this; spinning disk does not.

### 1.5 GPU

| Class          | Models                                | Use                          |
| -------------- | ------------------------------------- | ---------------------------- |
| **Consumer**   | RTX 4090 (24 GB), RTX 5090 (32 GB)    | dev, single-user             |
| **Workstation**| RTX A5000 (24 GB), A6000 (48 GB)      | small team, batched inference|
| **Datacenter** | A100 40/80 GB, H100 80 GB             | peak burst, multi-pod        |

For sizing, see `docs/infrastructure/gpu-requirements.md`. For the RunPod-driven GPU story, see `docs/infrastructure/evaluate-hostings.md`.

### 1.6 Network

- 1 Gbps minimum; 10 Gbps recommended at P5.
- Static IPv4 + IPv6.
- Public DNS record pointing at the host (for ACME / Let's Encrypt). For TLS reverse-proxy patterns, see §6 and `docs/ops/bare-metal/network.md`.

---

## 2. Base OS Install (Ubuntu 22.04 LTS)

### 2.1 Install profile

- Server minimal ISO, no desktop.
- Partition layout:
  - `/` 50 GB ext4 (or 30 GB + LVM)
  - `swap` = RAM (or 16 GB max)
  - `/data` 100 % of remaining NVMe (RAID-1 device - see §4)
- Enable OpenSSH server, unattended-upgrades.
- Disable root SSH login; create `deploy` user with sudo + ssh key.

### 2.2 First-boot hardening

```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install unattended-upgrades fail2ban chrony mdadm zfsutils-linux
sudo systemctl enable --now fail2ban chrony unattended-upgrades

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
# Web-facing ports added later (see docs/ops/bare-metal/network.md)
```

### 2.3 Kernel tuning for the data plane

Append to `/etc/sysctl.d/99-loop-lore.conf`:

```text
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
vm.swappiness = 10
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
fs.file-max = 2097152
fs.nr_open = 1048576
```

Apply: `sudo sysctl --system`.

### 2.4 Filesystem mounts

`/etc/fstab` example for a data-on-NVMe node:

```text
UUID=<data-raid-uuid> /data ext4 defaults,noatime,nodiratime,data=writeback,barrier=0 0 2
```

`noatime` cuts metadata writes ~20 %. `barrier=0` is safe with battery-backed RAID controller + UPS; otherwise leave the default.

---

## 3. Runtime Install

### 3.1 Bun

```bash
curl -fsSL https://bun.sh/install | bash
# pin to the version captured in docs/ops/bare-metal/requirements.txt
```

Verify: `bun --version`.

### 3.2 loop-lore checkout

```bash
sudo mkdir -p /opt/loop-lore && sudo chown deploy:deploy /opt/loop-lore
git clone https://git.example.org/loop-lore/loop-lore.git /opt/loop-lore
cd /opt/loop-lore
git checkout <release-tag>
```

### 3.3 System packages

`docs/ops/bare-metal/requirements.txt` pins the canonical list. Install with:

```bash
sudo apt -y install $(awk '{print $1}' docs/ops/bare-metal/requirements.txt)
```

That file captures: `build-essential`, `ca-certificates`, `curl`, `git`, `jq`, `libssl-dev`, `lm-sensors`, `mdadm`, `nginx` (or `caddy` if using their binary), `nvme-cli`, `postgresql-client`, `prometheus-node-exporter`, `smartmontools`, `ufw`, `unattended-upgrades`, `zfsutils-linux` (optional).

### 3.4 GPU driver + CUDA (optional, §5)

Skip until you reach §5.

---

## 4. Storage: NVMe, RAID, Backups

### 4.1 NVMe layout

- Assume two NVMe devices (`/dev/nvme0n1`, `/dev/nvme1n1`).
- System on `/dev/nvme0n1` partition 1 (ext4, 50 GB).
- Data on `/dev/nvme{0,1}n1` partition 2 (RAID-1).

```bash
lsblk -d -o NAME,SIZE,MODEL
sudo nvme smart-log /dev/nvme0n1 | head
```

### 4.2 RAID-1 (mdadm)

```bash
sudo mdadm --create --verbose /dev/md0 --level=1 \
  --raid-devices=2 /dev/nvme0n1p2 /dev/nvme1n1p2
sudo mkfs.ext4 -L loop-lore-data /dev/md0
sudo mkdir -p /data
sudo mount /dev/md0 /data
echo "DEVICE partitions" | sudo tee /etc/mdadm/mdadm.conf
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u
```

Persist in `/etc/fstab` (UUID form):

```bash
echo "UUID=$(blkid -s UUID -o value /dev/md0) /data ext4 defaults,noatime,nodiratime 0 2" \
  | sudo tee -a /etc/fstab
```

### 4.3 ZFS mirror (alternative)

When ZFS is preferred (snapshots, send/receive for backups):

```bash
sudo zpool create -f loop-lore-pool mirror /dev/nvme0n1p2 /dev/nvme1n1p2
sudo zfs create -o mountpoint=/data -o atime=off -o recordsize=128K -o compression=lz4 loop-lore-pool/data
```

`recordsize=128K` matches loop-lore's mixed small-row + asset-blob workload reasonably well. Verify with `zpool iostat -v 5` during a smoke test (§10).

### 4.4 Database placement

- SQLite default DB: `/data/loop-lore/sqlite/main.db`. Ensure `journal_mode=WAL` (set in app config).
- Postgres: `/data/pgdata` symlinked to `/var/lib/postgresql/16/main` after `pg_createcluster`.

### 4.5 Backups

| What                   | Method                                          | Frequency | Retention |
| ---------------------- | ----------------------------------------------- | --------- | --------- |
| `/data` snapshot       | `zfs send` (or `btrfs send`, `rsync --link-dest`) | hourly    | 24 h      |
| DB logical dump        | `sqlite3 .backup` or `pg_dumpall`              | hourly    | 7 days    |
| DB physical snapshot   | `zfs snapshot` + off-box push                  | daily     | 30 days   |
| Config (`/etc/loop-lore`, systemd unit overrides) | `etckeeper` / git | per change | forever |
| Model cache            | re-download (don't backup multi-GB GGUF files) | n/a       | n/a       |

Off-box push (minimum bar):

```bash
# Pick ONE scheduler: this cron file OR the backup-*.timer units in §7 — both
# fire the hourly DB snapshot at :15; never enable both.
# /etc/cron.d/loop-lore-backup
# DB snapshot: repo-shipped scripts/backup-sqlite.ts (bun must be on cron's PATH).
15 * * * * deploy /usr/bin/env bun run /opt/loop-lore/scripts/backup-sqlite.ts
# Off-box push: no script ships with the repo — provision your own and adjust.
0 3 * * *  deploy /opt/loop-lore/scripts/backup/zfs-send-offsite.sh  # placeholder; provisioning required
```

Verify restore quarterly (see §10.4). Backups you've never restored are wishful thinking.

### 4.6 SMART + scrub

```bash
sudo smartctl -t short /dev/nvme0n1   # one-shot self-test
sudo smartctl -H /dev/nvme0n1
# mdadm weekly scrub
echo "0 4 * * 0 root /usr/sbin/mdadm --misc --action=check /dev/md0" \
  | sudo tee /etc/cron.d/md-scrub
# zfs weekly scrub
echo "0 5 * * 0 root /sbin/zpool scrub loop-lore-pool" \
  | sudo tee /etc/cron.d/zfs-scrub
```

---

## 5. GPU / CUDA

### 5.1 Driver selection

| GPU class        | Recommended driver | CUDA toolkit |
| ---------------- | ------------------ | ------------ |
| RTX 4090 / 5090  | >= 550 (open)      | 12.x         |
| A100 / H100      | >= 535 (data center)| 12.x        |
| A6000 / L40      | >= 535             | 12.x         |

```bash
sudo apt -y install linux-headers-$(uname -r)
sudo add-apt-repository -y ppa:graphics-drivers/ppa
sudo apt -y install nvidia-driver-555
sudo reboot
nvidia-smi  # sanity
```

### 5.2 CUDA toolkit

```bash
# Pin to the version captured in docs/ops/bare-metal/requirements.txt
wget https://developer.download.nvidia.com/compute/cuda/12.6.3/local_installers/cuda_12.6.3_560.35.03_linux.run
sudo sh cuda_12.6.3_560.35.03_linux.run --silent --toolkit
echo 'export PATH=/usr/local/cuda-12.6/bin:$PATH' | sudo tee /etc/profile.d/cuda.sh
```

### 5.3 llama.cpp / llama-swap install

```bash
sudo apt -y install build-essential cmake libcurl4-openssl-dev pkg-config
# llama.cpp is a C++ project built with cmake (there is no cargo crate named
# llama-cpp-server); alternatively pull prebuilt release binaries from
# https://github.com/ggml-org/llama.cpp/releases
git clone https://github.com/ggml-org/llama.cpp /opt/src/llama.cpp
cmake -S /opt/src/llama.cpp -B /opt/src/llama.cpp/build -DGGML_CUDA=ON
cmake --build /opt/src/llama.cpp/build -j
sudo cp /opt/src/llama.cpp/build/bin/llama-server /usr/local/bin/
# llama-swap binary
curl -fsSL https://github.com/mostlygeek/llama-swap/releases/latest/download/llama-swap-linux-amd64 \
  -o /usr/local/bin/llama-swap && sudo chmod +x /usr/local/bin/llama-swap
```

### 5.4 Verification

```bash
# Smoke: load a 7B GGUF and request 32 tokens.
llama-server -m /data/models/llama-3.1-8b-instruct.Q4_K_M.gguf \
  --port 8081 --ctx-size 4096 --n-gpu-layers 99
curl -s http://127.0.0.1:8081/v1/models | jq
curl -s http://127.0.0.1:8081/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"llama-3.1-8b-instruct.Q4_K_M","max_tokens":32,"messages":[{"role":"user","content":"ping"}]}' | jq
```

First-token latency under 200 ms and sustained >=40 tok/s on RTX 4090 for an 8B Q4_K_M is the smoke bar.

### 5.5 Process supervision

`llama-server` and `llama-swap` are managed by their own systemd units (see `docs/ops/bare-metal/systemd/`). loop-lore talks to `llama-swap` over a local Unix socket / loopback port; it never exposes GPU services on the LAN.

---

## 6. Networking, TLS, Firewall

The full network reference lives in `docs/ops/bare-metal/network.md`. Highlights:

- Edge TLS via Caddy or nginx. ACME via HTTP-01 for a single host, DNS-01 for wildcard.
- `ufw` rules (see §2.2): allow 80/443 from `any`, allow SSH from jump-host CIDR only.
- PostgreSQL port (5432) bound to `127.0.0.1` or the private VLAN.
- llama-swap port (8081) bound to `127.0.0.1` only.
- Federation peers: see `docs/spec/crypto.md` + `epic-anonymity-decentralization.md` for SPKI pinning + Tor considerations.

For the canonical production topology (Caddy + Bun + Postgres), see `docs/spec/build-deploy.md`.

---

## 7. systemd Units

Companion files (under `docs/ops/bare-metal/systemd/`):

| File                                 | Purpose                                            |
| ------------------------------------ | -------------------------------------------------- |
| `loop-lore.service`                  | Main Bun app - single-user or primary app node     |
| `loop-lore-worker.service`           | Optional worker for background jobs                |
| `llama-swap.service`                 | GPU swap multiplexer (one per GPU host)            |
| `llama-server@.service`              | Templated unit; one instance per model             |
| `pg-exporter.service`                | Prometheus exporter for Postgres                   |
| `node-exporter.service`              | Existing prometheus-node-exporter, hardened        |
| `backup-sqlite.service` + `.timer`   | Hourly logical DB snapshot                         |
| `backup-zfs-send.service` + `.timer` | Daily off-box snapshot                             |

> These units are provisioning **templates**, not turn-key: `loop-lore.service`
> and `loop-lore-worker.service` reference ExecStart wrappers
> (`scripts/run-app.sh`, `scripts/run-worker.sh`) that the repo does not ship —
> point them at real start commands (see each unit's header) before installing.
> The backup units target the repo's `scripts/backup-sqlite.ts` (via bun) and a
> provision-your-own off-box push.

### 7.1 Install pattern

```bash
sudo cp docs/ops/bare-metal/systemd/loop-lore.service /etc/systemd/system/
sudo cp docs/ops/bare-metal/systemd/*.service /etc/systemd/system/
sudo cp docs/ops/bare-metal/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now loop-lore llama-swap backup-sqlite.timer backup-zfs-send.timer
```

### 7.2 Restart / reload policy

- Default to `Restart=on-failure` with `RestartSec=5s`.
- Cert rotation: `SIGHUP` triggers a config-reload path (see `TASK-replace-sighup-full-restart-with-server-reload-for-cert-rota.md`).
- Crashes: `StartLimitIntervalSec=300`, `StartLimitBurst=5`.

---

## 8. Monitoring & Alerting

### 8.1 Local exporters

- `prometheus-node-exporter` - host metrics (CPU, RAM, disk, network).
- `pg-exporter` (Postgres) - DB metrics.
- loop-lore's own `/metrics` route (when `OBSERVABILITY_METRICS_ENABLED=true`) - request latency, queue depth, generation backlog.

### 8.2 What to alert on

| Signal                                | Threshold                  | Severity |
| ------------------------------------- | -------------------------- | -------- |
| Disk free                             | < 15 %                     | warning  |
| Disk free                             | < 5 %                      | page     |
| mdadm degraded                        | any                        | page     |
| ZFS pool `DEGRADED`                   | any                        | page     |
| 5xx ratio (5 min)                     | > 1 %                      | warning  |
| Token latency p99 (5 min)             | > 2× baseline              | warning  |
| Failed `bun run db:migrate` on release | any                        | page     |
| Backup timer "skipped"                | > 1 cycle                  | warning  |
| Off-box push failed                   | > 2 cycles                 | page     |

Wire into your existing Prometheus + Alertmanager stack. Runbook values are heuristic; calibrate to your own SLOs (see `epic-performance-dashboard-slo.md`).

### 8.3 Logs

- App: canonical JSONL via `FileTransport` (default `/var/log/loop-lore/app.jsonl`).
- DB: `journalctl -u postgresql -f`.
- GPU: `journalctl -u llama-swap -f` + `nvidia-smi -l 5`.

PII is censored at the logger boundary (see `docs/spec/logging.md`).

---

## 9. Backup Strategy

Already sketched in §4.5; this section is the *operational* summary.

### 9.1 RPO / RTO targets

| Tier          | RPO (data loss budget) | RTO (recovery time) |
| ------------- | ---------------------- | ------------------- |
| **P3 dev**    | 24 h                   | 4 h                 |
| **P4 steady** | 1 h                    | 1 h                 |
| **P5 burst**  | 15 min                 | 30 min              |

P5 needs continuous WAL shipping or ZFS send every 15 min. P3 can tolerate overnight snapshots.

### 9.2 Verify-restore drill

Quarterly:

1. Restore last snapshot into a throwaway VM.
2. Start `loop-lore.service` pointed at the restored DB.
3. Hit `/api/health`.
4. Open a fixture chat session end-to-end.

If it fails: open a ticket, fix the backup script before continuing the cycle.

### 9.3 Credential storage

DB passwords, ACME account keys, BYOK provider tokens live in `/etc/loop-lore/secrets.env` with `chmod 0600`, owned by `loop-lore:loop-lore`. The runbook does not inline secrets; use your existing secret manager (Vault, sops, age, etc.).

---

## 10. Verification Checklist (Run Once After Deploy)

### 10.1 System

- [ ] `uname -a` shows Ubuntu 22.04 LTS.
- [ ] `ufw status` shows expected allow-list.
- [ ] `sysctl net.ipv4.tcp_congestion_control` reports `bbr`.

### 10.2 App

- [ ] `systemctl status loop-lore` reports `active (running)`.
- [ ] `curl -fsS http://127.0.0.1:3000/api/health` returns `200`.
- [ ] `bun --version` matches `requirements.txt`.

### 10.3 GPU (if enabled)

- [ ] `nvidia-smi` shows the expected model with 0 % util at idle.
- [ ] Smoke request (`§5.4`) returns >=40 tok/s on consumer, >=120 tok/s on A100.

### 10.4 Backups

- [ ] `backup-sqlite.timer` `next` field shows an upcoming run.
- [ ] One manual restore completed end-to-end (logged in `/var/log/loop-lore/restore-drill.log`).

### 10.5 TLS

- [ ] `curl -vI https://<domain>` returns HTTP/2 with valid chain (Caddy/nginx ACME).
- [ ] `openssl s_client -connect <domain>:443 -tls1_2` confirms TLS >= 1.2 only.

---

## 11. Topology Notes

### 11.1 Single server (P3 / small P4)

One host runs Bun, SQLite, and llama-swap. Reverse-proxy on the same host. Easiest topology; sufficient for solo and small teams.

### 11.2 Two-node (P4)

- **App node:** Bun + nginx/Caddy + llama-swap on GPU-equipped host.
- **DB node:** Postgres on a separate host; private VLAN.

Use streaming replication for HA; fail-over with `patroni` or similar (out of scope for this runbook - see `epic-data-integrity-acid.md`).

### 11.3 Three-node (P5)

- **Edge:** Caddy (TLS, rate limit, WAF rules).
- **App + cache:** Bun app x 2 behind a load balancer; Redis for prompt cache.
- **DB:** Postgres primary + replica.
- **GPU pool:** llama-swap on one or more dedicated GPU hosts.

Reference architecture and queue wiring: `docs/spec/build-deploy.md` and `docs/spec/architecture.md`.

---

## 12. Out of Scope (Forward References)

- Containerized deployment - see `Dockerfile`, `deploy/docker-compose.yml`, and TASK-001.
- Cost / hosting decision - see `docs/infrastructure/evaluate-hostings.md`.
- Federation + Tor - `epic-anonymity-decentralization.md`, `epic-federation-swarm-sync.md`.
- Database backup strategy deep dive - `epic-database-backup-recovery.md`.
- DB-engine selection (SQLite vs Postgres) - `TASK-test-dialect-matrix.md`.

---

## 13. Change Log

- **2026-09-22:** Initial publication (TASK-002). Coexists with `docs/spec/build-deploy.md` for containerized paths; this runbook is the on-prem / dedicated-server counterpart.
