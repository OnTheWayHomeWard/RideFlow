"""
RideFlow Instance Manager.

A small web tool that runs on the host (not in Docker) and manages any number
of RideFlow instances — one per company — on this server or on remote servers
reached over SSH.

  * Releases  — `git pull` the source checkout and build shared images
                (rideflow/<service>:<git-sha>) once; every instance runs them.
  * Instances — create (fresh / config-only copy / full copy of another
                instance), start, stop, restart, update to a release, logs,
                backups, delete. Each instance = a folder with compose.yml +
                .env, its own Postgres volume, and a Caddy site file.
  * Servers   — add a remote server with IP + root password once; the manager
                installs its SSH key, Docker and Caddy there. The password is
                never stored.

Layout on a server:
  /opt/rideflow/instances/<slug>/{compose.yml,.env,firebase-service-account.json}
  /etc/caddy/sites/<slug>.caddy          (imported by /etc/caddy/Caddyfile)
Manager state: /opt/rideflow/manager-data/ (sqlite db, ssh key, backups).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import shlex
import sqlite3
import subprocess
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import paramiko
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

# ─── Config ──────────────────────────────────────────────────────────────

HERE = Path(__file__).resolve().parent
BASE = Path(os.environ.get("RFM_BASE", "/opt/rideflow"))
DATA = BASE / "manager-data"
BACKUPS = DATA / "backups"
INSTANCES_DIR = "/opt/rideflow/instances"          # same path on every server
CADDY_SITES = "/etc/caddy/sites"
SOURCE_DIR = Path(os.environ.get("RFM_SOURCE_DIR", "/root/RideFlow"))
BASE_DOMAIN = os.environ.get("RFM_BASE_DOMAIN", "gobellme.com")
USER = os.environ.get("RFM_USER", "admin")
PASSWORD = os.environ.get("RFM_PASSWORD", "")
SECRET = (os.environ.get("RFM_SECRET") or hashlib.sha256(("rfm" + PASSWORD).encode()).hexdigest()).encode()
SSH_KEY = DATA / "id_ed25519"
TEMPLATE = (HERE / "instance-compose.yml").read_text()
SERVICES = ["backend", "client", "staff", "website"]
FRONTENDS = ["client", "staff", "website"]

# Tables whose ROWS are skipped in a "config only" copy (schema is kept).
TRANSACTIONAL_TABLES = [
    "bookings", "payments", "payment_splits", "payout_batches", "ratings",
    "notifications", "notification_log", "contact_submissions", "fcm_tokens",
]
INTEGRATION_KEYS = [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID",
    "GOOGLE_MAPS_API_KEY",
]
SANDBOX_ENV = {
    "STRIPE_SECRET_KEY": "sk_test_placeholder", "STRIPE_WEBHOOK_SECRET": "whsec_placeholder",
    "TWILIO_ACCOUNT_SID": "placeholder", "TWILIO_AUTH_TOKEN": "placeholder",
    "TWILIO_PHONE_NUMBER": "placeholder", "TWILIO_MESSAGING_SERVICE_SID": "",
}

DATA.mkdir(parents=True, exist_ok=True)
BACKUPS.mkdir(parents=True, exist_ok=True)

# ─── Storage ─────────────────────────────────────────────────────────────

_db_lock = threading.Lock()


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DATA / "manager.db", check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _db_lock, db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL,
            port INTEGER DEFAULT 22, user TEXT DEFAULT 'root', is_local INTEGER DEFAULT 0,
            notes TEXT DEFAULT '', created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS instances (
            id INTEGER PRIMARY KEY, slug TEXT NOT NULL, company TEXT NOT NULL,
            contact_name TEXT DEFAULT '', contact_email TEXT DEFAULT '', contact_phone TEXT DEFAULT '',
            environment TEXT DEFAULT 'production', tags TEXT DEFAULT '', notes TEXT DEFAULT '',
            server_id INTEGER NOT NULL, project TEXT NOT NULL, directory TEXT NOT NULL,
            domain_website TEXT DEFAULT '', domain_client TEXT DEFAULT '', domain_staff TEXT DEFAULT '',
            port_website INTEGER, port_client INTEGER, port_staff INTEGER,
            image_tag TEXT DEFAULT '', caddy_managed INTEGER DEFAULT 1, brand_color TEXT DEFAULT '',
            created_at TEXT, updated_at TEXT,
            UNIQUE(server_id, slug)
        );
        CREATE TABLE IF NOT EXISTS releases (
            tag TEXT PRIMARY KEY, commit_msg TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY, title TEXT, kind TEXT, instance_id INTEGER, server_id INTEGER,
            status TEXT, log TEXT DEFAULT '', created_at TEXT, finished_at TEXT
        );
        """)
        if not con.execute("SELECT 1 FROM servers WHERE is_local=1").fetchone():
            con.execute(
                "INSERT INTO servers(name, host, is_local, created_at) VALUES (?,?,1,?)",
                ("This server", "localhost", now()),
            )
        # A job still "running" after a restart was interrupted.
        con.execute("UPDATE jobs SET status='failed', log=log||'\n[interrupted: manager restarted]' WHERE status='running'")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def q(sql, args=(), one=False):
    with _db_lock, db() as con:
        rows = [dict(r) for r in con.execute(sql, args).fetchall()]
    return (rows[0] if rows else None) if one else rows


def ex(sql, args=()) -> int:
    with _db_lock, db() as con:
        cur = con.execute(sql, args)
        return cur.lastrowid


# ─── Executors (local shell / remote SSH) ────────────────────────────────

class CmdError(Exception):
    pass


class Executor:
    label = ""

    def run(self, cmd: str, input_bytes: bytes | None = None, check=True, timeout=1800,
            binary=False) -> tuple[int, bytes]:
        """binary=True keeps stderr out of the returned bytes (for dumps etc.)."""
        raise NotImplementedError

    def sh(self, cmd: str, **kw) -> str:
        return self.run(cmd, **kw)[1].decode(errors="replace")

    def write(self, path: str, content: str | bytes, mode: int = 0o600):
        data = content.encode() if isinstance(content, str) else content
        d = os.path.dirname(path)
        self.run(f"mkdir -p {shlex.quote(d)} && cat > {shlex.quote(path)} && chmod {mode:o} {shlex.quote(path)}", input_bytes=data)

    def read(self, path: str) -> str:
        return self.sh(f"cat {shlex.quote(path)}")

    def exists(self, path: str) -> bool:
        return self.run(f"test -e {shlex.quote(path)}", check=False)[0] == 0


class LocalExec(Executor):
    label = "local"

    def run(self, cmd, input_bytes=None, check=True, timeout=1800, binary=False):
        p = subprocess.run(["bash", "-c", cmd], input=input_bytes, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE if binary else subprocess.STDOUT, timeout=timeout)
        if check and p.returncode != 0:
            err = (p.stderr or b"") if binary else p.stdout
            raise CmdError(f"exit {p.returncode}: {err.decode(errors='replace')[-2000:]}")
        return p.returncode, p.stdout


class RemoteExec(Executor):
    def __init__(self, host, port=22, user="root", password: str | None = None):
        self.label = f"{user}@{host}"
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        kw = dict(hostname=host, port=int(port or 22), username=user, timeout=20, banner_timeout=30)
        if password:
            kw.update(password=password, look_for_keys=False, allow_agent=False)
        else:
            kw.update(key_filename=str(SSH_KEY), look_for_keys=False, allow_agent=False)
        self.client.connect(**kw)
        self.client.get_transport().set_keepalive(20)

    def run(self, cmd, input_bytes=None, check=True, timeout=1800, binary=False):
        chan = self.client.get_transport().open_session()
        chan.settimeout(timeout)
        chan.set_combine_stderr(not binary)
        chan.exec_command(f"bash -c {shlex.quote(cmd)}")
        if input_bytes is not None:
            for i in range(0, len(input_bytes), 32768):
                chan.sendall(input_bytes[i:i + 32768])
            chan.shutdown_write()
        out = io.BytesIO()
        while True:
            data = chan.recv(65536)
            if not data:
                break
            out.write(data)
        code = chan.recv_exit_status()
        err = b""
        if binary:
            while chan.recv_stderr_ready():
                err += chan.recv_stderr(65536)
        chan.close()
        if check and code != 0:
            raise CmdError(f"exit {code}: {(err if binary else out.getvalue()).decode(errors='replace')[-2000:]}")
        return code, out.getvalue()

    def pipe_from_local(self, local_cmd: str, remote_cmd: str, log=None):
        """Stream a local command's stdout into a remote command's stdin."""
        src = subprocess.Popen(["bash", "-c", local_cmd], stdout=subprocess.PIPE)
        chan = self.client.get_transport().open_session()
        chan.set_combine_stderr(True)
        chan.exec_command(f"bash -c {shlex.quote(remote_cmd)}")
        sent, last = 0, time.time()
        while True:
            chunk = src.stdout.read(1 << 20)
            if not chunk:
                break
            chan.sendall(chunk)
            sent += len(chunk)
            if log and time.time() - last > 10:
                log(f"  … {sent / 1e6:.0f} MB sent")
                last = time.time()
        chan.shutdown_write()
        out = b""
        while True:
            data = chan.recv(65536)
            if not data:
                break
            out += data
        code = chan.recv_exit_status()
        src.wait()
        if src.returncode != 0 or code != 0:
            raise CmdError(f"pipe failed (local {src.returncode}, remote {code}): {out.decode(errors='replace')[-1500:]}")
        return sent

    def close(self):
        self.client.close()


def executor_for(server: dict) -> Executor:
    if server["is_local"]:
        return LocalExec()
    return RemoteExec(server["host"], server["port"], server["user"])


def server(sid) -> dict:
    s = q("SELECT * FROM servers WHERE id=?", (sid,), one=True)
    if not s:
        raise HTTPException(404, "server not found")
    return s


def instance(iid) -> dict:
    i = q("SELECT * FROM instances WHERE id=?", (iid,), one=True)
    if not i:
        raise HTTPException(404, "instance not found")
    return i


# ─── Jobs (long-running work with a live log) ────────────────────────────

_job_logs: dict[int, list[str]] = {}
_busy: set[int] = set()          # instance ids with a job in flight
_busy_lock = threading.Lock()

SECRET_PAT = re.compile(r"(PASSWORD|SECRET|TOKEN|KEY)=\S+", re.I)


def start_job(title: str, kind: str, fn, instance_id=None, server_id=None) -> int:
    if instance_id:
        with _busy_lock:
            if instance_id in _busy:
                raise HTTPException(409, "Another job is already running for this instance")
            _busy.add(instance_id)
    jid = ex("INSERT INTO jobs(title, kind, instance_id, server_id, status, created_at) VALUES (?,?,?,?,?,?)",
             (title, kind, instance_id, server_id, "running", now()))
    _job_logs[jid] = []

    def log(msg: str):
        line = f"[{dt.datetime.now().strftime('%H:%M:%S')}] {SECRET_PAT.sub(lambda m: m.group(1) + '=***', msg)}"
        _job_logs[jid].append(line)

    def runner():
        status = "success"
        try:
            fn(log)
            log("✔ done")
        except Exception as e:  # noqa: BLE001
            status = "failed"
            log(f"✖ {e}")
            log(traceback.format_exc(limit=3))
        finally:
            ex("UPDATE jobs SET status=?, log=?, finished_at=? WHERE id=?",
               (status, "\n".join(_job_logs[jid]), now(), jid))
            if instance_id:
                with _busy_lock:
                    _busy.discard(instance_id)
            _status_cache.clear()

    threading.Thread(target=runner, daemon=True).start()
    return jid


# ─── Helpers ─────────────────────────────────────────────────────────────

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")[:30]


def sql_lit(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def env_escape(v: str) -> str:
    """Value safe for a compose .env file (literal `$`)."""
    return str(v).replace("$", "$$").replace("\n", "")


def parse_env(text: str) -> dict[str, str]:
    """KEY -> raw line (verbatim), so values keep compose semantics when copied."""
    out = {}
    for line in text.splitlines():
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
        if m and not line.lstrip().startswith("#"):
            out[m.group(1)] = line
    return out


def set_env_line(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    if re.search(rf"(?m)^{key}=.*$", text):
        return re.sub(rf"(?m)^{key}=.*$", lambda _: line, text)
    return text.rstrip("\n") + "\n" + line + "\n"


def compose(inst: dict, args: str) -> str:
    d = shlex.quote(inst["directory"])
    return f"cd {d} && docker compose -p {shlex.quote(inst['project'])} -f compose.yml --env-file .env {args}"


def psql(ex_: Executor, inst: dict, sql: str) -> str:
    return ex_.sh(compose(inst, "exec -T db psql -U rideflow -d rideflow -v ON_ERROR_STOP=1 -At"),
                  input_bytes=sql.encode())


def upsert_settings(ex_: Executor, inst: dict, values: dict):
    rows = []
    for k, v in values.items():
        val = json.dumps(v)
        rows.append(f"({sql_lit(k)}, {sql_lit(val)}::jsonb)")
    if rows:
        psql(ex_, inst, "INSERT INTO settings(key, value) VALUES " + ", ".join(rows) +
             " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();")


def wait_db(ex_: Executor, inst: dict, log, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        code, _ = ex_.run(compose(inst, "exec -T db pg_isready -U rideflow -h 127.0.0.1"), check=False)
        if code == 0:
            # the image restarts postgres once after initdb — make sure it's the real one
            time.sleep(2)
            if ex_.run(compose(inst, "exec -T db pg_isready -U rideflow -h 127.0.0.1"), check=False)[0] == 0:
                return
        time.sleep(2)
    raise CmdError("database did not become ready")


def wait_settings(ex_: Executor, inst: dict, log, timeout=180):
    """Wait until the backend has migrated + bootstrapped (settings rows exist)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        code, out = ex_.run(compose(inst, "exec -T db psql -U rideflow -d rideflow -At -c 'SELECT count(*) FROM settings'"), check=False, binary=True)
        if code == 0 and out.strip().isdigit() and int(out.strip()) > 0:
            return
        time.sleep(3)
    raise CmdError("backend did not finish starting (no settings rows) — check its logs")


def wait_healthy(ex_: Executor, inst: dict, log, timeout=240) -> dict:
    """Wait until all three frontends answer /api/settings/public with 200 (backend up)."""
    t0, h = time.time(), {}
    while time.time() - t0 < timeout:
        h = health(ex_, inst)
        if all(v == "200" for v in h.values()):
            log(f"Healthy: {h}")
            return h
        time.sleep(4)
    raise CmdError(f"instance not healthy after {timeout}s: {h} — check the backend logs")


def health(ex_: Executor, inst: dict) -> dict:
    out = {}
    for svc in ("website", "client", "staff"):
        port = inst[f"port_{svc}"]
        code = ex_.sh(f"curl -s -o /dev/null -m 5 -w '%{{http_code}}' http://127.0.0.1:{port}/api/settings/public || true").strip()
        out[svc] = code
    return out


def caddy_block(inst: dict) -> str:
    lines = [f"# {inst['company']} — managed by RideFlow Instance Manager (instance '{inst['slug']}')"]
    for svc in ("website", "client", "staff"):
        dom = (inst.get(f"domain_{svc}") or "").strip()
        if dom:
            lines.append(f"{dom} {{\n    reverse_proxy localhost:{inst[f'port_{svc}']}\n}}\n")
    return "\n".join(lines) + "\n"


def caddy_apply(ex_: Executor, inst: dict, log, remove=False):
    path = f"{CADDY_SITES}/{inst['slug']}.caddy"
    backup = ex_.sh(f"cat {path} 2>/dev/null || true", check=False) if ex_.exists(path) else None
    if remove:
        ex_.run(f"rm -f {path}")
    else:
        ex_.write(path, caddy_block(inst), mode=0o644)
    code, out = ex_.run("caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1", check=False)
    if code != 0:
        # roll back so the live proxy is never broken
        if backup is not None:
            ex_.write(path, backup, mode=0o644)
        else:
            ex_.run(f"rm -f {path}")
        raise CmdError("Caddy config invalid, change rolled back:\n" + out.decode(errors="replace")[-800:])
    ex_.run("systemctl reload caddy")
    log("Caddy reloaded" + (" (site removed)" if remove else f" → {path}"))


def ensure_caddy_import(ex_: Executor, log):
    ex_.run(f"mkdir -p {CADDY_SITES}")
    cf = ex_.sh("cat /etc/caddy/Caddyfile 2>/dev/null || true")
    if f"import {CADDY_SITES}/*.caddy" not in cf:
        ex_.run(f"cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true")
        ex_.write("/etc/caddy/Caddyfile", cf.rstrip("\n") + f"\n\nimport {CADDY_SITES}/*.caddy\n", mode=0o644)
        log("Added `import /etc/caddy/sites/*.caddy` to Caddyfile")


def used_ports(ex_: Executor) -> set[int]:
    out = ex_.sh("ss -ltnH | awk '{print $4}' | sed -E 's/.*:([0-9]+)$/\\1/'", check=False)
    return {int(p) for p in out.split() if p.isdigit()}


def suggest_ports(server_id: int, ex_: Executor | None = None) -> dict:
    taken = set()
    for i in q("SELECT port_website, port_client, port_staff FROM instances WHERE server_id=?", (server_id,)):
        taken |= {i["port_website"], i["port_client"], i["port_staff"]}
    if ex_:
        taken |= used_ports(ex_)
    base = 6170
    while True:
        trio = (base + 2, base + 3, base + 4)
        if not taken & set(trio):
            return {"website": trio[0], "client": trio[1], "staff": trio[2]}
        base += 10


# ─── Release images ──────────────────────────────────────────────────────

def image_refs(tag: str) -> list[str]:
    return [f"rideflow/{s}:{tag}" for s in SERVICES]


def ensure_images(ex_: Executor, tag: str, log):
    """Make sure a server has the release images (remote: stream them over SSH)."""
    missing = [r for r in image_refs(tag) if ex_.run(f"docker image inspect {r} >/dev/null 2>&1", check=False)[0] != 0]
    if not missing:
        return
    if isinstance(ex_, LocalExec):
        raise CmdError(f"images missing locally: {missing} — build the release first")
    log(f"Uploading {len(missing)} image(s) to {ex_.label} (this can take a few minutes)…")
    sent = ex_.pipe_from_local(f"docker save {' '.join(missing)} | gzip -1", "gunzip | docker load", log=log)
    log(f"Images uploaded ({sent / 1e6:.0f} MB)")


def latest_tag() -> str:
    r = q("SELECT tag FROM releases ORDER BY created_at DESC LIMIT 1", one=True)
    return r["tag"] if r else ""


def job_build_release(log):
    ex_ = LocalExec()
    src = shlex.quote(str(SOURCE_DIR))
    log(f"git pull in {SOURCE_DIR}")
    log(ex_.sh(f"cd {src} && git pull --ff-only 2>&1").strip())
    tag = ex_.sh(f"cd {src} && git rev-parse --short HEAD").strip()
    msg = ex_.sh(f"cd {src} && git log -1 --format=%s").strip()
    log(f"Building release {tag} — {msg}")
    log("building backend…")
    ex_.run(f"cd {src} && docker build -q -t rideflow/backend:{tag} -t rideflow/backend:latest backend")
    for fe in FRONTENDS:
        log(f"building {fe}…")
        ex_.run(f"cd {src}/frontend/{fe} && docker build -q -f Dockerfile.prod -t rideflow/{fe}:{tag} -t rideflow/{fe}:latest .")
    ex("INSERT OR REPLACE INTO releases(tag, commit_msg, created_at) VALUES (?,?,?)", (tag, msg, now()))
    log(f"Release {tag} ready")


# ─── Instance operations ─────────────────────────────────────────────────

def op_up(inst: dict, log, ex_: Executor | None = None):
    ex_ = ex_ or executor_for(server(inst["server_id"]))
    if inst["image_tag"]:
        ensure_images(ex_, inst["image_tag"], log)
    log(ex_.sh(compose(inst, "up -d --remove-orphans 2>&1")).strip()[-1500:])


def job_update(inst_id: int, tag: str):
    def run(log):
        inst = instance(inst_id)
        ex_ = executor_for(server(inst["server_id"]))
        log(f"Updating {inst['company']} → release {tag}")
        ensure_images(ex_, tag, log)
        envp = f"{inst['directory']}/.env"
        ex_.write(envp, set_env_line(ex_.read(envp), "RF_TAG", tag))
        ex("UPDATE instances SET image_tag=?, updated_at=? WHERE id=?", (tag, now(), inst_id))
        inst["image_tag"] = tag
        log("Backing up database before update…")
        take_backup(inst, ex_, log, reason="pre-update")
        op_up(inst, log, ex_)
        wait_healthy(ex_, inst, log)
    return run


def take_backup(inst: dict, ex_: Executor, log, reason="manual") -> str:
    _, dump = ex_.run(compose(inst, "exec -T db pg_dump -U rideflow -d rideflow -Fc"), binary=True)
    name = f"{inst['slug']}-s{inst['server_id']}-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}-{reason}.dump"
    (BACKUPS / name).write_bytes(dump)
    log(f"Backup saved: {name} ({len(dump) / 1024:.0f} KB)")
    return name


class CreateInstance(BaseModel):
    company: str
    slug: str
    contact_name: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    environment: str = "production"
    tags: str = ""
    notes: str = ""
    server_id: int
    domain_website: str = ""
    domain_client: str = ""
    domain_staff: str = ""
    port_website: int
    port_client: int
    port_staff: int
    image_tag: str = ""
    seed_mode: str = Field("config", pattern="^(config|full|fresh)$")
    source_instance_id: int | None = None
    integrations: str = Field("inherit", pattern="^(inherit|sandbox|custom)$")
    custom_env: dict[str, str] = {}
    admin_email: str = ""
    admin_password: str = ""
    brand_primary_color: str = ""
    brand_secondary_color: str = ""
    company_logo_url: str = ""


def job_create(inst_id: int, req: CreateInstance):
    def run(log):
        inst = instance(inst_id)
        srv = server(inst["server_id"])
        ex_ = executor_for(srv)
        src = instance(req.source_instance_id) if req.source_instance_id else None
        src_ex = executor_for(server(src["server_id"])) if src else None
        tag = inst["image_tag"]
        log(f"Creating '{inst['company']}' on {srv['name']} ({ex_.label}), release {tag}")

        if not isinstance(ex_, LocalExec):
            prepare_server(ex_, log)
        ensure_caddy_import(ex_, log)
        ensure_images(ex_, tag, log)

        busy = used_ports(ex_) & {inst["port_website"], inst["port_client"], inst["port_staff"]}
        if busy:
            raise CmdError(f"ports already in use on server: {sorted(busy)}")

        # ── .env ──
        lines = [
            f"# {inst['company']} — RideFlow instance '{inst['slug']}' (managed)",
            f"COMPOSE_PROJECT_NAME={inst['project']}",
            f"RF_TAG={tag}",
            f"WEBSITE_PORT={inst['port_website']}",
            f"CLIENT_PORT={inst['port_client']}",
            f"STAFF_PORT={inst['port_staff']}",
            f"DB_PASSWORD={secrets.token_hex(16)}",
            f"JWT_SECRET={secrets.token_hex(32)}",
        ]
        src_env = parse_env(src_ex.read(f"{src['directory']}/.env")) if src else {}
        for k in INTEGRATION_KEYS:
            if req.integrations == "custom" and req.custom_env.get(k, "").strip():
                lines.append(f"{k}={env_escape(req.custom_env[k].strip())}")
            elif req.integrations == "sandbox" and k in SANDBOX_ENV:
                lines.append(f"{k}={SANDBOX_ENV[k]}")
            elif k in src_env:
                lines.append(src_env[k])          # verbatim — same meaning as the source
        if req.seed_mode == "fresh" and req.admin_email:
            lines.append(f"DEFAULT_ADMIN_EMAIL={env_escape(req.admin_email)}")
            lines.append(f"DEFAULT_ADMIN_PASSWORD={env_escape(req.admin_password)}")
        d = inst["directory"]
        ex_.run(f"mkdir -p {shlex.quote(d)}")
        ex_.write(f"{d}/.env", "\n".join(lines) + "\n")
        ex_.write(f"{d}/compose.yml", TEMPLATE, mode=0o644)
        fb = ""
        if src and src_ex.exists(f"{src['directory']}/firebase-service-account.json"):
            fb = src_ex.read(f"{src['directory']}/firebase-service-account.json")
        elif (SOURCE_DIR / "firebase-service-account.json").exists():
            fb = (SOURCE_DIR / "firebase-service-account.json").read_text()
        ex_.write(f"{d}/firebase-service-account.json", fb or "{}")
        log(f"Wrote {d}/.env, compose.yml, firebase-service-account.json")

        # ── database ──
        log(ex_.sh(compose(inst, "up -d db 2>&1")).strip()[-500:])
        wait_db(ex_, inst, log)
        if req.seed_mode in ("config", "full") and src:
            excl = "" if req.seed_mode == "full" else " ".join(f"--exclude-table-data={t}" for t in TRANSACTIONAL_TABLES)
            log(f"Dumping {'config-only' if excl else 'full'} data from '{src['company']}'…")
            _, dump = src_ex.run(compose(src, f"exec -T db pg_dump -U rideflow -d rideflow -Fc {excl}"), binary=True)
            log(f"Restoring {len(dump) / 1024:.0f} KB…")
            ex_.run(compose(inst, "exec -T db pg_restore -U rideflow -d rideflow --no-owner --exit-on-error"), input_bytes=dump)

        # ── app ──
        op_up(inst, log, ex_)
        log("Waiting for backend migrations + bootstrap…")
        wait_settings(ex_, inst, log)

        scheme = lambda dom, port: f"https://{dom}" if dom else f"http://{srv_public_host(srv)}:{port}"  # noqa: E731
        settings = {
            "company_name": inst["company"],
            "client_base_url": scheme(inst["domain_client"], inst["port_client"]),
            "staff_base_url": scheme(inst["domain_staff"], inst["port_staff"]),
            "website_base_url": scheme(inst["domain_website"], inst["port_website"]),
        }
        if req.brand_primary_color:
            settings["brand_primary_color"] = req.brand_primary_color
        if req.brand_secondary_color:
            settings["brand_secondary_color"] = req.brand_secondary_color
        if req.company_logo_url:
            settings["company_logo_url"] = req.company_logo_url
        if req.contact_email:
            settings["company_email"] = req.contact_email
        if req.contact_phone:
            settings["company_phone"] = req.contact_phone
        if req.integrations == "sandbox":
            settings.update({"sms_enabled": False, "email_enabled": False})
        upsert_settings(ex_, inst, settings)
        log("Applied company settings (name, URLs, branding)")

        if inst["caddy_managed"] and any(inst[f"domain_{s}"] for s in ("website", "client", "staff")):
            caddy_apply(ex_, inst, log)
        wait_healthy(ex_, inst, log)
        log("Instance is up. Remember to point DNS A records for its domains at " + srv_public_host(srv))
    return run


def srv_public_host(srv: dict) -> str:
    return os.environ.get("RFM_PUBLIC_IP", "localhost") if srv["is_local"] else srv["host"]


def prepare_server(ex_: Executor, log):
    if ex_.run("command -v docker >/dev/null && docker compose version >/dev/null", check=False)[0] != 0:
        log("Installing Docker (get.docker.com)…")
        ex_.run("curl -fsSL https://get.docker.com | sh", timeout=1800)
    if ex_.run("command -v caddy >/dev/null", check=False)[0] != 0:
        log("Installing Caddy…")
        ex_.run(
            "apt-get update -qq && apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg && "
            "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && "
            "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list && "
            "apt-get update -qq && apt-get install -y -qq caddy", timeout=1800)
    ex_.run(f"mkdir -p {INSTANCES_DIR} {CADDY_SITES}")
    if not ex_.exists("/etc/caddy/Caddyfile"):
        ex_.write("/etc/caddy/Caddyfile", "", mode=0o644)


# ─── Status ──────────────────────────────────────────────────────────────

_status_cache: dict[int, tuple[float, dict]] = {}


def server_status(srv: dict) -> dict:
    """{project: {service: state}} for one server — a single `docker ps` call."""
    hit = _status_cache.get(srv["id"])
    if hit and time.time() - hit[0] < 8:
        return hit[1]
    res: dict = {}
    try:
        ex_ = executor_for(srv)
        out = ex_.sh("docker ps -a --format '{{.Label \"com.docker.compose.project\"}}|{{.Label \"com.docker.compose.service\"}}|{{.State}}'")
        for line in out.splitlines():
            parts = line.split("|")
            if len(parts) == 3 and parts[0]:
                res.setdefault(parts[0], {})[parts[1]] = parts[2]
        if isinstance(ex_, RemoteExec):
            ex_.close()
    except Exception as e:  # noqa: BLE001
        res = {"__error__": str(e)}
    _status_cache[srv["id"]] = (time.time(), res)
    return res


def instance_state(inst: dict, st: dict) -> str:
    if "__error__" in st:
        return "unreachable"
    svcs = st.get(inst["project"], {})
    running = sum(1 for s in ("db", *SERVICES) if svcs.get(s) == "running")
    if running == 5:
        return "running"
    if running == 0:
        return "stopped"
    return "degraded"


# ─── Auth ────────────────────────────────────────────────────────────────

def sign(value: str) -> str:
    return hmac.new(SECRET, value.encode(), hashlib.sha256).hexdigest()


def make_session() -> str:
    exp = str(int(time.time()) + 12 * 3600)
    return f"{exp}.{sign(exp)}"


def valid_session(tok: str | None) -> bool:
    if not tok or "." not in tok:
        return False
    exp, sig = tok.split(".", 1)
    return hmac.compare_digest(sig, sign(exp)) and exp.isdigit() and int(exp) > time.time()


_login_attempts: dict[str, list[float]] = {}

app = FastAPI(title="RideFlow Instance Manager", docs_url=None, redoc_url=None)


@app.middleware("http")
async def auth_mw(request: Request, call_next):
    path = request.url.path
    if path in ("/login", "/api/login", "/favicon.ico") or valid_session(request.cookies.get("rfm_session")):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "not authenticated"}, status_code=401)
    return RedirectResponse("/login")


class Login(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def login(body: Login, request: Request):
    ip = request.client.host if request.client else "?"
    recent = [t for t in _login_attempts.get(ip, []) if time.time() - t < 600]
    if len(recent) >= 10:
        raise HTTPException(429, "Too many attempts, wait 10 minutes")
    if not PASSWORD or not (hmac.compare_digest(body.username, USER) and hmac.compare_digest(body.password, PASSWORD)):
        _login_attempts[ip] = recent + [time.time()]
        raise HTTPException(401, "Wrong username or password")
    resp = JSONResponse({"ok": True})
    resp.set_cookie("rfm_session", make_session(), httponly=True, samesite="strict", max_age=12 * 3600,
                    secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https")
    return resp


@app.post("/api/logout")
def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("rfm_session")
    return resp


@app.get("/login", response_class=HTMLResponse)
def login_page():
    return (HERE / "static" / "login.html").read_text()


@app.get("/", response_class=HTMLResponse)
def index():
    return (HERE / "static" / "index.html").read_text()


# ─── API: overview ───────────────────────────────────────────────────────

@app.get("/api/overview")
def overview():
    servers = q("SELECT * FROM servers ORDER BY is_local DESC, name")
    instances = q("SELECT * FROM instances ORDER BY company")
    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = dict(zip([s["id"] for s in servers], pool.map(server_status, servers)))
    with _busy_lock:
        busy = set(_busy)
    for i in instances:
        st = statuses.get(i["server_id"], {})
        i["state"] = instance_state(i, st)
        i["services"] = st.get(i["project"], {})
        i["busy"] = i["id"] in busy
        srv = next((s for s in servers if s["id"] == i["server_id"]), None)
        i["server_name"] = srv["name"] if srv else "?"
        i["public_host"] = srv_public_host(srv) if srv else ""
    for s in servers:
        st = statuses.get(s["id"], {})
        s["reachable"] = "__error__" not in st
        s["error"] = st.get("__error__", "")
        s["instance_count"] = sum(1 for i in instances if i["server_id"] == s["id"])
    releases = q("SELECT * FROM releases ORDER BY created_at DESC LIMIT 20")
    return {"servers": servers, "instances": instances, "releases": releases,
            "latest_tag": latest_tag(), "base_domain": BASE_DOMAIN}


@app.get("/api/suggest")
def suggest(server_id: int, slug: str = ""):
    srv = server(server_id)
    try:
        ex_ = executor_for(srv)
        ports = suggest_ports(server_id, ex_)
    except Exception:  # noqa: BLE001
        ports = suggest_ports(server_id)
    s = slugify(slug)
    doms = {"website": f"{s}.{BASE_DOMAIN}", "client": f"{s}.ride.{BASE_DOMAIN}",
            "staff": f"{s}.staff.{BASE_DOMAIN}"} if s else {}
    return {"ports": ports, "domains": doms}


# ─── API: instances ──────────────────────────────────────────────────────

@app.post("/api/instances")
def create_instance(req: CreateInstance):
    slug = slugify(req.slug)
    if not slug or len(slug) < 2:
        raise HTTPException(400, "slug must be at least 2 characters (a-z, 0-9, -)")
    server(req.server_id)
    if q("SELECT 1 FROM instances WHERE server_id=? AND slug=?", (req.server_id, slug), one=True):
        raise HTTPException(400, f"an instance '{slug}' already exists on that server")
    ports = [req.port_website, req.port_client, req.port_staff]
    if len(set(ports)) != 3 or any(not (1024 < p < 65535) for p in ports):
        raise HTTPException(400, "ports must be 3 different numbers between 1025 and 65534")
    for other in q("SELECT * FROM instances WHERE server_id=?", (req.server_id,)):
        if set(ports) & {other["port_website"], other["port_client"], other["port_staff"]}:
            raise HTTPException(400, f"ports clash with instance '{other['slug']}'")
    if req.seed_mode != "fresh" and not req.source_instance_id:
        raise HTTPException(400, "choose a source instance to copy from")
    if req.integrations == "inherit" and not req.source_instance_id:
        raise HTTPException(400, "'same as source' integrations needs a source instance")
    if req.seed_mode == "fresh" and (not req.admin_email or len(req.admin_password) < 8):
        raise HTTPException(400, "fresh instances need an admin email and a password (8+ chars)")
    for c in (req.brand_primary_color, req.brand_secondary_color):
        if c and not re.fullmatch(r"#[0-9a-fA-F]{6}", c):
            raise HTTPException(400, "colours must be hex like #0f766e")
    for d in (req.domain_website, req.domain_client, req.domain_staff):
        if d and not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", d.strip().lower()):
            raise HTTPException(400, f"invalid domain: {d}")
    tag = req.image_tag or latest_tag()
    if not tag:
        raise HTTPException(400, "no release built yet — build one on the Releases tab first")
    project = f"rideflow-{slug}"
    iid = ex("""INSERT INTO instances(slug, company, contact_name, contact_email, contact_phone, environment, tags,
                notes, server_id, project, directory, domain_website, domain_client, domain_staff, port_website,
                port_client, port_staff, image_tag, caddy_managed, brand_color, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)""",
             (slug, req.company.strip(), req.contact_name, req.contact_email, req.contact_phone, req.environment,
              req.tags, req.notes, req.server_id, project, f"{INSTANCES_DIR}/{slug}",
              req.domain_website.strip().lower(), req.domain_client.strip().lower(), req.domain_staff.strip().lower(),
              req.port_website, req.port_client, req.port_staff, tag, req.brand_primary_color, now(), now()))
    jid = start_job(f"Create {req.company}", "create", job_create(iid, req), instance_id=iid, server_id=req.server_id)
    return {"id": iid, "job_id": jid}


class EditInstance(BaseModel):
    company: str
    contact_name: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    environment: str = "production"
    tags: str = ""
    notes: str = ""
    domain_website: str = ""
    domain_client: str = ""
    domain_staff: str = ""
    apply_domains: bool = False


@app.put("/api/instances/{iid}")
def edit_instance(iid: int, body: EditInstance):
    old = instance(iid)
    ex("""UPDATE instances SET company=?, contact_name=?, contact_email=?, contact_phone=?, environment=?, tags=?,
          notes=?, domain_website=?, domain_client=?, domain_staff=?, updated_at=? WHERE id=?""",
       (body.company, body.contact_name, body.contact_email, body.contact_phone, body.environment, body.tags,
        body.notes, body.domain_website.strip().lower(), body.domain_client.strip().lower(),
        body.domain_staff.strip().lower(), now(), iid))
    domains_changed = any(old[f"domain_{s}"] != getattr(body, f"domain_{s}").strip().lower() for s in ("website", "client", "staff"))
    if body.apply_domains and domains_changed:
        def run(log):
            inst = instance(iid)
            ex_ = executor_for(server(inst["server_id"]))
            if inst["caddy_managed"]:
                caddy_apply(ex_, inst, log)
            else:
                log("Caddy for this instance is managed by hand — update /etc/caddy/Caddyfile yourself")
            upsert_settings(ex_, inst, {
                "client_base_url": f"https://{inst['domain_client']}" if inst["domain_client"] else "",
                "staff_base_url": f"https://{inst['domain_staff']}" if inst["domain_staff"] else "",
                "website_base_url": f"https://{inst['domain_website']}" if inst["domain_website"] else "",
            })
            log("Updated public URLs in the instance settings")
        return {"job_id": start_job(f"Apply domains for {body.company}", "domains", run, instance_id=iid)}
    return {"ok": True}


@app.post("/api/instances/{iid}/action/{action}")
def instance_action(iid: int, action: str, tag: str = ""):
    inst = instance(iid)
    title = f"{action.capitalize()} {inst['company']}"
    if action == "start":
        fn = lambda log: op_up(inst, log)  # noqa: E731
    elif action in ("stop", "restart"):
        def fn(log):
            ex_ = executor_for(server(inst["server_id"]))
            log(ex_.sh(compose(inst, f"{action} 2>&1")).strip()[-1500:])
    elif action == "update":
        tag = tag or latest_tag()
        if not tag or not q("SELECT 1 FROM releases WHERE tag=?", (tag,), one=True):
            raise HTTPException(400, "no such release")
        title = f"Update {inst['company']} → {tag}"
        fn = job_update(iid, tag)
    elif action == "backup":
        def fn(log):
            take_backup(inst, executor_for(server(inst["server_id"])), log)
    elif action == "health":
        def fn(log):
            log(f"Health (HTTP codes for /api/settings/public): {health(executor_for(server(inst['server_id'])), inst)}")
    else:
        raise HTTPException(400, "unknown action")
    return {"job_id": start_job(title, action, fn, instance_id=iid, server_id=inst["server_id"])}


@app.delete("/api/instances/{iid}")
def delete_instance(iid: int, confirm: str, delete_data: bool = False):
    inst = instance(iid)
    if confirm != inst["slug"]:
        raise HTTPException(400, "type the instance slug to confirm")
    if inst["slug"] == "gobellme" or not inst["caddy_managed"]:
        raise HTTPException(400, "this instance was imported (managed by hand) — remove it manually")

    def run(log):
        ex_ = executor_for(server(inst["server_id"]))
        try:
            take_backup(inst, ex_, log, reason="pre-delete")
        except Exception as e:  # noqa: BLE001
            log(f"(backup skipped: {e})")
        log(ex_.sh(compose(inst, f"down {'-v' if delete_data else ''} 2>&1"), check=False).strip()[-800:])
        if inst["caddy_managed"]:
            caddy_apply(ex_, inst, log, remove=True)
        ex_.run(f"rm -rf {shlex.quote(inst['directory'])}")
        ex("DELETE FROM instances WHERE id=?", (iid,))
        log("Instance removed" + (" (data volume deleted)" if delete_data else " (data volume kept)"))
    return {"job_id": start_job(f"Delete {inst['company']}", "delete", run, instance_id=iid)}


@app.get("/api/instances/{iid}/logs")
def instance_logs(iid: int, service: str = "backend", lines: int = 200):
    inst = instance(iid)
    if service not in ("db", *SERVICES):
        raise HTTPException(400, "bad service")
    ex_ = executor_for(server(inst["server_id"]))
    out = ex_.sh(compose(inst, f"logs --no-color --tail {min(int(lines), 2000)} {service} 2>&1"), check=False)
    return {"logs": out}


@app.get("/api/backups")
def list_backups():
    files = sorted(BACKUPS.glob("*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [{"name": p.name, "size": p.stat().st_size,
             "created_at": dt.datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds")} for p in files[:200]]


@app.get("/api/backups/{name}")
def download_backup(name: str):
    p = BACKUPS / name
    if "/" in name or not p.exists():
        raise HTTPException(404)
    return FileResponse(p, filename=name)


# ─── API: servers ────────────────────────────────────────────────────────

class AddServer(BaseModel):
    name: str
    host: str
    port: int = 22
    user: str = "root"
    password: str
    notes: str = ""
    install: bool = True


def ensure_ssh_key():
    if not SSH_KEY.exists():
        subprocess.run(["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "rideflow-manager", "-f", str(SSH_KEY)],
                       check=True, capture_output=True)


@app.post("/api/servers")
def add_server(body: AddServer):
    if not re.fullmatch(r"[A-Za-z0-9.-]+", body.host):
        raise HTTPException(400, "invalid host")
    ensure_ssh_key()
    # Verify the password synchronously so the user gets an immediate answer.
    try:
        r = RemoteExec(body.host, body.port, body.user, password=body.password)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"SSH login failed: {e}")
    pub = (SSH_KEY.with_suffix(".pub")).read_text().strip()
    r.run("mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys")
    r.run(f"grep -qxF {shlex.quote(pub)} ~/.ssh/authorized_keys || echo {shlex.quote(pub)} >> ~/.ssh/authorized_keys")
    sid = ex("INSERT INTO servers(name, host, port, user, notes, created_at) VALUES (?,?,?,?,?,?)",
             (body.name, body.host, body.port, body.user, body.notes, now()))

    def run(log):
        try:
            log(f"Key installed on {body.user}@{body.host}. Testing key login…")
            k = RemoteExec(body.host, body.port, body.user)
            log(k.sh("hostname; uname -sr; (. /etc/os-release && echo $PRETTY_NAME); nproc; free -h | head -2").strip())
            if body.install:
                prepare_server(k, log)
                ensure_caddy_import(k, log)
                log(k.sh("docker --version; caddy version").strip())
            k.close()
        finally:
            r.close()
    jid = start_job(f"Add server {body.name}", "server", run, server_id=sid)
    return {"id": sid, "job_id": jid}


@app.delete("/api/servers/{sid}")
def delete_server(sid: int):
    s = server(sid)
    if s["is_local"]:
        raise HTTPException(400, "cannot remove the local server")
    if q("SELECT 1 FROM instances WHERE server_id=?", (sid,), one=True):
        raise HTTPException(400, "server still has instances")
    ex("DELETE FROM servers WHERE id=?", (sid,))
    return {"ok": True}


# ─── API: releases & jobs ────────────────────────────────────────────────

@app.post("/api/releases/build")
def build_release():
    if any(j for j in q("SELECT 1 FROM jobs WHERE kind='release' AND status='running'")):
        raise HTTPException(409, "a build is already running")
    return {"job_id": start_job("Build release from latest code", "release", job_build_release)}


class Rollout(BaseModel):
    tag: str = ""
    instance_ids: list[int] | None = None   # None = every instance


@app.post("/api/releases/rollout")
def rollout(body: Rollout):
    """Update the chosen instances (default: all) to a release, one at a time.
    Works for rollbacks too — pick an older tag."""
    tag = body.tag or latest_tag()
    if not q("SELECT 1 FROM releases WHERE tag=?", (tag,), one=True):
        raise HTTPException(400, f"unknown release {tag}")
    rows = q("SELECT * FROM instances ORDER BY company")
    if body.instance_ids is not None:
        rows = [i for i in rows if i["id"] in set(body.instance_ids)]
    targets = [i for i in rows if i["image_tag"] != tag]
    if not targets:
        raise HTTPException(400, f"selected instance(s) already run {tag}")
    with _busy_lock:
        clash = [i["slug"] for i in targets if i["id"] in _busy]
    if clash:
        raise HTTPException(409, f"busy: {', '.join(clash)} — wait for their running job to finish")

    def run(log):
        ok, failed = [], []
        for n, i in enumerate(targets, 1):
            log(f"── [{n}/{len(targets)}] {i['company']} ({i['image_tag'] or '?'} → {tag})")
            with _busy_lock:
                _busy.add(i["id"])
            try:
                job_update(i["id"], tag)(log)
                ok.append(i["slug"])
            except Exception as e:  # noqa: BLE001
                failed.append(i["slug"])
                log(f"  ✖ failed: {e} — continuing with the next instance")
            finally:
                with _busy_lock:
                    _busy.discard(i["id"])
                _status_cache.clear()
        log(f"Summary: updated {len(ok)} {ok}" + (f", FAILED {failed}" if failed else ""))
        if failed:
            raise CmdError(f"{len(failed)} instance(s) failed: {failed}")
    names = ", ".join(i["slug"] for i in targets)
    return {"job_id": start_job(f"Update {names} → {tag}", "rollout", run)}


@app.get("/api/jobs")
def jobs(limit: int = 30):
    rows = q("SELECT id, title, kind, instance_id, server_id, status, created_at, finished_at FROM jobs ORDER BY id DESC LIMIT ?", (limit,))
    return rows


@app.get("/api/jobs/{jid}")
def job(jid: int):
    j = q("SELECT * FROM jobs WHERE id=?", (jid,), one=True)
    if not j:
        raise HTTPException(404)
    if j["status"] == "running" and jid in _job_logs:
        j["log"] = "\n".join(_job_logs[jid])
    return j


init_db()
