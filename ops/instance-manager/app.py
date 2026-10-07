"""
RideFlow Instance Manager.

A small web tool that runs on the host (not in Docker) and manages any number
of RideFlow instances — one per company — on this server or on remote servers
reached over SSH.

  * Releases  — `git pull` the source checkout and build shared images
                (rideflow/<service>:<git-sha>) once; every instance runs them.
  * Instances — create (fresh / settings-only copy / everything except
                rides & payments / full copy of another instance), start, stop, restart, update to a release, logs,
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
ENV_FILE = Path(os.environ.get("RFM_ENV_FILE", "/etc/rideflow-manager.env"))
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
        cols = {r[1] for r in con.execute("PRAGMA table_info(instances)").fetchall()}
        if "domain_status" not in cols:
            con.execute("ALTER TABLE instances ADD COLUMN domain_status TEXT DEFAULT ''")
        if "integ_status" not in cols:
            con.execute("ALTER TABLE instances ADD COLUMN integ_status TEXT DEFAULT ''")
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
    """Ports that are taken on a server: anything listening right now, plus host
    ports reserved by Docker containers that are currently stopped."""
    out = ex_.sh("ss -ltnH | awk '{print $4}' | sed -E 's/.*:([0-9]+)$/\\1/'", check=False)
    out += " " + ex_.sh(
        "docker ps -aq | xargs -r docker inspect --format "
        "'{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostPort}} {{end}}{{end}}' 2>/dev/null",
        check=False)
    return {int(p) for p in out.split() if p.isdigit()}


_port_lock = threading.Lock()   # held while picking + reserving ports for a new instance


def taken_ports(server_id: int, ex_: Executor | None = None) -> set[int]:
    taken = set()
    for i in q("SELECT port_website, port_client, port_staff FROM instances WHERE server_id=?", (server_id,)):
        taken |= {i["port_website"], i["port_client"], i["port_staff"]}
    if ex_:
        taken |= used_ports(ex_)
    return taken


def suggest_ports(server_id: int, ex_: Executor | None = None, taken: set[int] | None = None) -> dict:
    """First free block of 3 consecutive ports: 6172-6174, 6182-6184, 6192-6194, …"""
    taken = taken if taken is not None else taken_ports(server_id, ex_)
    base = 6170
    while base < 60000:
        trio = (base + 2, base + 3, base + 4)
        if not taken & set(trio):
            return {"website": trio[0], "client": trio[1], "staff": trio[2]}
        base += 10
    raise HTTPException(400, "no free port block found")


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
    # 0 / omitted = pick 3 free consecutive ports automatically
    port_website: int = 0
    port_client: int = 0
    port_staff: int = 0
    image_tag: str = ""
    # config      = settings only (everything else empty, new admin login)
    # operational = all data except rides/payments/notifications
    # full        = everything        fresh = empty, built-in defaults
    seed_mode: str = Field("config", pattern="^(config|operational|full|fresh)$")
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
        if req.seed_mode in ("fresh", "config") and req.admin_email:
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
        if req.seed_mode in ("operational", "full") and src:
            excl = "" if req.seed_mode == "full" else " ".join(f"--exclude-table-data={t}" for t in TRANSACTIONAL_TABLES)
            log(f"Dumping {'all data except rides/payments' if excl else 'full'} data from '{src['company']}'…")
            _, dump = src_ex.run(compose(src, f"exec -T db pg_dump -U rideflow -d rideflow -Fc {excl}"), binary=True)
            log(f"Restoring {len(dump) / 1024:.0f} KB…")
            ex_.run(compose(inst, "exec -T db pg_restore -U rideflow -d rideflow --no-owner --exit-on-error"), input_bytes=dump)

        # ── app ──
        op_up(inst, log, ex_)
        log("Waiting for backend migrations + bootstrap…")
        wait_settings(ex_, inst, log)
        if req.seed_mode == "config" and src:
            copy_settings(src_ex, src, ex_, inst, log)

        settings = {"company_name": inst["company"], **public_urls(inst, srv)}
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
        elif req.integrations == "custom":
            for k in ("resend_api_key", "resend_from_email", "resend_from_name"):
                if req.custom_env.get(k, "").strip():
                    settings[k] = req.custom_env[k].strip()
            if req.custom_env.get("resend_api_key", "").strip():
                settings["email_enabled"] = True
        upsert_settings(ex_, inst, settings)
        log("Applied company settings (name, URLs, branding)")

        if inst["caddy_managed"] and any(inst[f"domain_{s}"] for s in ("website", "client", "staff")):
            caddy_apply(ex_, inst, log)
        wait_healthy(ex_, inst, log)
        log("Instance is up: " + ", ".join(f"http://{srv_public_host(srv)}:{inst[f'port_{x}']}" for x in ("website", "client", "staff")))
        if any(inst[f"domain_{x}"] for x in ("website", "client", "staff")):
            domain_report(inst, srv, log)
    return run


def copy_settings(src_ex: Executor, src: dict, ex_: Executor, inst: dict, log):
    """Copy every row of the source's settings table (incl. uploaded logo) — nothing else."""
    sql = ("SELECT coalesce(json_agg(json_build_object('key', key, 'value', value, 'description', description)), '[]') "
           "FROM settings WHERE key NOT IN ('client_base_url', 'staff_base_url', 'website_base_url')")
    _, out = src_ex.run(compose(src, "exec -T db psql -U rideflow -d rideflow -At -v ON_ERROR_STOP=1"),
                        input_bytes=sql.encode(), binary=True)
    rows = json.loads(out.decode())
    psql(ex_, inst,
         "INSERT INTO settings(key, value, description) "
         f"SELECT key, value, description FROM json_to_recordset({sql_lit(json.dumps(rows))}::json) "
         "AS x(key text, value jsonb, description text) "
         "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, "
         "updated_by = NULL, updated_at = now();")
    log(f"Copied {len(rows)} settings from '{src['company']}' (no other data)")


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
    # The password is part of the key, so changing it signs out every session.
    return hmac.new(SECRET + PASSWORD.encode() + b"\0" + USER.encode(), value.encode(), hashlib.sha256).hexdigest()


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


NO_CACHE = {"Cache-Control": "no-store, max-age=0"}


@app.get("/login", response_class=HTMLResponse)
def login_page():
    return HTMLResponse((HERE / "static" / "login.html").read_text(), headers=NO_CACHE)


@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse((HERE / "static" / "index.html").read_text(), headers=NO_CACHE)


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
    manual = [req.port_website, req.port_client, req.port_staff]
    if any(manual) and (len(set(manual)) != 3 or any(not (1024 < p < 65535) for p in manual)):
        raise HTTPException(400, "ports must be 3 different numbers between 1025 and 65534 (or leave them on Auto)")
    if req.seed_mode != "fresh" and not req.source_instance_id:
        raise HTTPException(400, "choose a source instance to copy from")
    if req.integrations == "inherit" and not req.source_instance_id:
        raise HTTPException(400, "'same as source' integrations needs a source instance")
    if req.seed_mode in ("fresh", "config") and (not req.admin_email or len(req.admin_password) < 8):
        raise HTTPException(400, "this data option needs a first admin email and a password (8+ chars)")
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
    _port_lock.acquire()
    try:
        try:
            srv_ex = executor_for(server(req.server_id))
            taken = taken_ports(req.server_id, srv_ex)
            if isinstance(srv_ex, RemoteExec):
                srv_ex.close()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"can't reach the server to check free ports: {e}")
        if any(manual):
            clash = sorted(taken & set(manual))
            if clash:
                raise HTTPException(400, f"port(s) {clash} already in use on that server — pick others or use Auto")
        else:
            auto = suggest_ports(req.server_id, taken=taken)
            req.port_website, req.port_client, req.port_staff = auto["website"], auto["client"], auto["staff"]
        iid = _insert_instance(req, slug, project, tag)
    finally:
        _port_lock.release()
    jid = start_job(f"Create {req.company}", "create", job_create(iid, req), instance_id=iid, server_id=req.server_id)
    return {"id": iid, "job_id": jid, "ports": {"website": req.port_website, "client": req.port_client, "staff": req.port_staff}}


def _insert_instance(req: "CreateInstance", slug: str, project: str, tag: str) -> int:
    return ex("""INSERT INTO instances(slug, company, contact_name, contact_email, contact_phone, environment, tags,
                notes, server_id, project, directory, domain_website, domain_client, domain_staff, port_website,
                port_client, port_staff, image_tag, caddy_managed, brand_color, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)""",
             (slug, req.company.strip(), req.contact_name, req.contact_email, req.contact_phone, req.environment,
              req.tags, req.notes, req.server_id, project, f"{INSTANCES_DIR}/{slug}",
              req.domain_website.strip().lower(), req.domain_client.strip().lower(), req.domain_staff.strip().lower(),
              req.port_website, req.port_client, req.port_staff, tag, req.brand_primary_color, now(), now()))


class EditInstance(BaseModel):
    company: str
    brand_color: str = ""
    sync_name: bool = False        # also rename the company inside the app (website, emails, SMS)
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
    # validate everything before saving anything
    if body.brand_color and not re.fullmatch(r"#[0-9a-fA-F]{6}", body.brand_color):
        raise HTTPException(400, "brand colour must be a hex value like #0f766e")
    if not body.company.strip():
        raise HTTPException(400, "company name is required")
    if body.environment not in ("production", "staging", "demo"):
        raise HTTPException(400, "environment must be production, staging or demo")
    for d in (body.domain_website, body.domain_client, body.domain_staff):
        if d.strip() and not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", d.strip().lower()):
            raise HTTPException(400, f"invalid domain: {d}")
    ex("""UPDATE instances SET company=?, contact_name=?, contact_email=?, contact_phone=?, environment=?, tags=?,
          notes=?, domain_website=?, domain_client=?, domain_staff=?, updated_at=? WHERE id=?""",
       (body.company.strip(), body.contact_name, body.contact_email, body.contact_phone, body.environment, body.tags,
        body.notes, body.domain_website.strip().lower(), body.domain_client.strip().lower(),
        body.domain_staff.strip().lower(), now(), iid))
    brand_changed = (body.brand_color or "") != (old.get("brand_color") or "")
    name_changed = body.sync_name and body.company.strip() != old["company"]
    ex("UPDATE instances SET brand_color=? WHERE id=?", (body.brand_color, iid))
    domains_changed = any(old[f"domain_{s}"] != getattr(body, f"domain_{s}").strip().lower() for s in ("website", "client", "staff"))
    if (brand_changed or name_changed) and not (body.apply_domains and domains_changed):
        # push name / colour into the instance itself (instant, no restart)
        try:
            vals = {}
            if name_changed:
                vals["company_name"] = body.company.strip()
            if brand_changed:
                vals["brand_primary_color"] = body.brand_color
            upsert_settings(executor_for(server(old["server_id"])), old, vals)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(502, f"saved in the manager, but couldn't update the instance: {e}")
    if body.apply_domains and domains_changed:
        def run(log):
            inst = instance(iid)
            srv = server(inst["server_id"])
            ex_ = executor_for(srv)
            if inst["caddy_managed"]:
                caddy_apply(ex_, inst, log)
            else:
                log("⚠ Caddy for this instance is managed by hand — update /etc/caddy/Caddyfile yourself")
            extra = {}
            if name_changed:
                extra["company_name"] = inst["company"]
            if brand_changed:
                extra["brand_primary_color"] = inst["brand_color"]
            upsert_settings(ex_, inst, {**public_urls(inst, srv), **extra})
            log("Updated the app's public links: " + ", ".join(public_urls(inst, srv).values()))
            if any(inst[f"domain_{x}"] for x in ("website", "client", "staff")):
                log("Checking DNS + HTTPS (Caddy requests the certificate as soon as DNS points here)…")
                time.sleep(5)
                domain_report(inst, srv, log)
        return {"job_id": start_job(f"Apply domains for {body.company}", "domains", run, instance_id=iid)}
    return {"ok": True}


class ApplyDomains(BaseModel):
    domain_website: str = ""
    domain_client: str = ""
    domain_staff: str = ""


@app.post("/api/instances/{iid}/domains")
def apply_domains(iid: int, body: ApplyDomains):
    """Save the 3 domains and (re)apply them: Caddy config + forced reload (restarts certificate
    attempts right away), app links, then wait until HTTPS is live. Safe to run with no changes."""
    inst = instance(iid)
    doms = {k: getattr(body, f"domain_{k}").strip().lower().removeprefix("https://").removeprefix("http://").rstrip("/")
            for k in ("website", "client", "staff")}
    for d in doms.values():
        if d and not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", d):
            raise HTTPException(400, f"invalid domain: {d}")
    filled = [d for d in doms.values() if d]
    if len(filled) != len(set(filled)):
        raise HTTPException(400, "each app needs a different domain")
    for other in q("SELECT slug, domain_website, domain_client, domain_staff FROM instances WHERE id != ?", (iid,)):
        clash = set(filled) & {other["domain_website"], other["domain_client"], other["domain_staff"]}
        if clash:
            raise HTTPException(400, f"{', '.join(clash)} is already used by instance '{other['slug']}'")
    ex("UPDATE instances SET domain_website=?, domain_client=?, domain_staff=?, updated_at=? WHERE id=?",
       (doms["website"], doms["client"], doms["staff"], now(), iid))

    def run(log):
        cur = instance(iid)
        srv = server(cur["server_id"])
        ex_ = executor_for(srv)
        if cur["caddy_managed"]:
            caddy_apply(ex_, cur, log)
        else:
            log("⚠ This instance's Caddy blocks live in the main Caddyfile (managed by hand) — "
                "edit /etc/caddy/Caddyfile for domain changes. Updating the app links only.")
        urls = public_urls(cur, srv)
        upsert_settings(ex_, cur, urls)
        log("App links (SMS, emails, QR codes): " + ", ".join(urls.values()))
        if not filled:
            log("No domains — the apps are reachable by IP only.")
            return
        log("Waiting for DNS + HTTPS certificates (up to 2 minutes)…")
        t0, rep = time.time(), {}
        while True:
            rep = domain_report(cur, srv)
            states = [v["state"] for v in rep.values()]
            if all(st == "ok" for st in states) or "dns" in states or time.time() - t0 > 120:
                break
            time.sleep(10)
        for dom, st in rep.items():
            log(("  ✓ " if st["state"] == "ok" else "  ✖ ") + f"{dom}: {st['msg']}")
        if all(v["state"] == "ok" for v in rep.values()):
            log("All domains are live on HTTPS.")
        elif any(v["state"] == "dns" for v in rep.values()):
            log(f"Fix the DNS records above (A record → {srv_public_host(srv)}), then click Apply again.")
        else:
            log("Certificates are still being issued — Caddy keeps trying; click 'Check HTTPS' in a minute.")
    return {"job_id": start_job(f"Apply domains for {inst['company']}", "domains", run, instance_id=iid)}


def public_urls(inst: dict, srv: dict) -> dict:
    """What the app uses in SMS/emails/QR codes: https://domain, or http://IP:port without one."""
    def url(svc):
        dom = inst.get(f"domain_{svc}")
        return f"https://{dom}" if dom else f"http://{srv_public_host(srv)}:{inst[f'port_{svc}']}"
    return {"client_base_url": url("client"), "staff_base_url": url("staff"), "website_base_url": url("website")}


def domain_report(inst: dict, srv: dict, log=None) -> dict:
    """For each domain: does DNS point at the server, and is HTTPS (Caddy's Let's Encrypt cert) live?"""
    import socket
    want = srv_public_host(srv)
    out = {}
    for svc in ("website", "client", "staff"):
        dom = (inst.get(f"domain_{svc}") or "").strip()
        if not dom:
            continue
        try:
            ips = sorted({ai[4][0] for ai in socket.getaddrinfo(dom, 443, proto=socket.IPPROTO_TCP)})
        except socket.gaierror:
            ips = []
        if not ips:
            st = {"state": "dns", "msg": f"no DNS record yet — add an A record {dom} → {want}"}
        elif want not in ips:
            st = {"state": "dns", "msg": f"DNS points to {', '.join(ips)}, should be {want}"}
        else:
            code = LocalExec().sh(f"curl -s -o /dev/null -m 10 -w '%{{http_code}}' https://{dom}/ || true", check=False).strip()
            if code[:1] in ("2", "3"):
                st = {"state": "ok", "msg": "HTTPS ✓ (certificate active)"}
            else:
                st = {"state": "pending", "msg": "DNS ✓ — HTTPS not ready yet (Caddy is getting the certificate, usually < 1 min; ports 80/443 must be open)"}
        st["checked_at"] = now()
        out[dom] = st
        if log:
            log(f"  {dom}: {st['msg']}")
    ex("UPDATE instances SET domain_status=? WHERE id=?", (json.dumps(out), inst["id"]))
    return out


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
            srv = server(inst["server_id"])
            log(f"App health (HTTP codes for /api/settings/public): {health(executor_for(srv), inst)}")
            if any(inst[f"domain_{x}"] for x in ("website", "client", "staff")):
                log("Domains:")
                domain_report(inst, srv, log)
            else:
                log("No domains set — reachable by IP only. Add them under More → Edit details.")
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


ADMIN_SCRIPT = r"""
import sys, json, asyncio, bcrypt
from sqlalchemy import select
from app.database import async_session
from app.models import Admin

req = json.loads(sys.stdin.read())


def row(a):
    return {"id": str(a.id), "name": a.name, "email": a.email, "role": a.role, "is_active": a.is_active,
            "password_changed": a.password_changed, "created_at": a.created_at.isoformat() if a.created_at else None}


def hpw(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def active_supers(admins):
    return sum(1 for x in admins if x.role == "super_admin" and x.is_active)


async def main():
    async with async_session() as db:
        op = req["op"]
        admins = (await db.execute(select(Admin).order_by(Admin.created_at))).scalars().all()
        if op == "list":
            return [row(a) for a in admins]
        if op == "create":
            email = req["email"].strip().lower()
            if any(a.email.lower() == email for a in admins):
                raise ValueError("an admin with that email already exists")
            a = Admin(name=req["name"].strip(), email=email, password_hash=hpw(req["password"]), role=req["role"],
                      is_active=True, password_changed=not req.get("require_change", True))
            db.add(a)
            await db.commit()
            await db.refresh(a)
            return row(a)
        a = next((x for x in admins if str(x.id) == req.get("id")), None)
        if not a:
            raise ValueError("admin not found")
        if op == "reset":
            a.password_hash = hpw(req["password"])
            a.password_changed = not req.get("require_change", True)
            a.is_active = True
        elif op == "set_active":
            if not req["active"] and a.role == "super_admin" and a.is_active and active_supers(admins) <= 1:
                raise ValueError("can't disable the last active super admin")
            a.is_active = bool(req["active"])
        elif op == "set_role":
            if req["role"] != "super_admin" and a.role == "super_admin" and a.is_active and active_supers(admins) <= 1:
                raise ValueError("can't demote the last super admin")
            a.role = req["role"]
        else:
            raise ValueError("bad op")
        await db.commit()
        return row(a)

try:
    print("__RESULT__" + json.dumps({"ok": True, "data": asyncio.run(main())}))
except Exception as e:
    print("__RESULT__" + json.dumps({"ok": False, "error": str(e)}))
"""


def admin_op(inst: dict, payload: dict):
    """Run an admin-user operation inside the instance's backend container
    (uses the app's own models + bcrypt, so hashes match what the app expects)."""
    ex_ = executor_for(server(inst["server_id"]))
    _, out = ex_.run(compose(inst, f"exec -T backend python -c {shlex.quote(ADMIN_SCRIPT)}"),
                     input_bytes=json.dumps(payload).encode(), check=False, binary=True)
    line = next((ln for ln in out.decode(errors="replace").splitlines() if ln.startswith("__RESULT__")), None)
    if not line:
        raise HTTPException(502, "instance backend not reachable — is the instance running?")
    res = json.loads(line[len("__RESULT__"):])
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return res["data"]


def gen_password() -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(14))


class NewAdmin(BaseModel):
    name: str
    email: str
    role: str = Field("admin", pattern="^(admin|super_admin)$")
    password: str = ""
    require_change: bool = True


class ResetPassword(BaseModel):
    password: str = ""
    require_change: bool = True


@app.get("/api/instances/{iid}/admins")
def list_admins(iid: int):
    return admin_op(instance(iid), {"op": "list"})


@app.post("/api/instances/{iid}/admins")
def create_admin(iid: int, body: NewAdmin):
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", body.email.strip()):
        raise HTTPException(400, "invalid email")
    if not body.name.strip():
        raise HTTPException(400, "name is required")
    pw = body.password or gen_password()
    if len(pw) < 8:
        raise HTTPException(400, "password must be 8+ characters")
    a = admin_op(instance(iid), {"op": "create", "name": body.name, "email": body.email, "role": body.role,
                                 "password": pw, "require_change": body.require_change})
    return {"admin": a, "password": pw}


@app.post("/api/instances/{iid}/admins/{aid}/reset-password")
def reset_admin_password(iid: int, aid: str, body: ResetPassword):
    pw = body.password or gen_password()
    if len(pw) < 8:
        raise HTTPException(400, "password must be 8+ characters")
    a = admin_op(instance(iid), {"op": "reset", "id": aid, "password": pw, "require_change": body.require_change})
    return {"admin": a, "password": pw}


@app.post("/api/instances/{iid}/admins/{aid}/active")
def set_admin_active(iid: int, aid: str, active: bool):
    return admin_op(instance(iid), {"op": "set_active", "id": aid, "active": active})


@app.post("/api/instances/{iid}/admins/{aid}/role")
def set_admin_role(iid: int, aid: str, role: str):
    if role not in ("admin", "super_admin"):
        raise HTTPException(400, "bad role")
    return admin_op(instance(iid), {"op": "set_role", "id": aid, "role": role})


# ─── Integrations (Stripe / Twilio / Email / Maps) ─────────────────────────

# Where each value lives: .env (needs a backend restart) or the settings table (live).
INTEG_ENV = {
    "stripe": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    "twilio": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"],
    "maps": ["GOOGLE_MAPS_API_KEY"],
}
INTEG_SETTINGS = {
    "stripe": ["stripe_connect_enabled", "payout_currency"],
    "twilio": ["sms_enabled"],
    "email": ["email_enabled", "resend_api_key", "resend_from_email", "resend_from_name"],
}
SECRET_KEYS = {"STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TWILIO_AUTH_TOKEN", "GOOGLE_MAPS_API_KEY", "resend_api_key"}
ALL_ENV = [k for v in INTEG_ENV.values() for k in v]
ALL_SETTINGS = [k for v in INTEG_SETTINGS.values() for k in v]
PLACEHOLDERS = {"", "placeholder", "sk_test_placeholder", "whsec_placeholder", "your_key_here"}


def mask(key: str, v: str) -> str:
    if v in PLACEHOLDERS or key not in SECRET_KEYS:
        return v
    return (v[:8] + "…" + v[-4:]) if len(v) > 14 else "•" * 8


def effective_env(inst: dict, ex_: Executor) -> dict:
    """Values the running backend actually sees (compose-interpolated); falls back to .env."""
    script = "; ".join(f'printf "%s\\t%s\\n" {k} "${{{k}}}"' for k in ALL_ENV)
    code, out = ex_.run(compose(inst, f"exec -T backend sh -c {shlex.quote(script)}"), check=False, binary=True)
    vals = {}
    if code == 0:
        for line in out.decode(errors="replace").splitlines():
            k, _, v = line.partition("\t")
            if k in ALL_ENV:
                vals[k] = v
        if vals:
            return vals
    raw = parse_env(ex_.read(f"{inst['directory']}/.env"))
    for k in ALL_ENV:
        line = raw.get(k, f"{k}=")
        vals[k] = line.split("=", 1)[1].strip().strip('"').strip("'").replace("$$", "$")
    return vals


def current_settings(inst: dict, ex_: Executor, keys: list[str]) -> dict:
    sql = ("SELECT coalesce(json_object_agg(key, value), '{}') FROM settings WHERE key IN ("
           + ", ".join(sql_lit(k) for k in keys) + ")")
    _, out = ex_.run(compose(inst, "exec -T db psql -U rideflow -d rideflow -At -v ON_ERROR_STOP=1"),
                     input_bytes=sql.encode(), binary=True)
    return json.loads(out.decode() or "{}")


def summarize(env: dict, st: dict) -> dict:
    sk = env.get("STRIPE_SECRET_KEY", "")
    stripe = "off" if sk in PLACEHOLDERS else ("live" if sk.startswith(("sk_live", "rk_live")) else "test")
    tw = env.get("TWILIO_ACCOUNT_SID", "")
    sms = "off" if tw in PLACEHOLDERS or st.get("sms_enabled") is False else "on"
    email = "on" if st.get("email_enabled") is True and st.get("resend_api_key") else "off"
    maps = "off" if env.get("GOOGLE_MAPS_API_KEY", "") in PLACEHOLDERS else "on"
    return {"stripe": stripe, "sms": sms, "email": email, "maps": maps}


@app.get("/api/instances/{iid}/integrations")
def get_integrations(iid: int):
    inst = instance(iid)
    srv = server(inst["server_id"])
    ex_ = executor_for(srv)
    env = effective_env(inst, ex_)
    st = current_settings(inst, ex_, ALL_SETTINGS)
    summary = summarize(env, {k: st.get(k) for k in ALL_SETTINGS})
    ex("UPDATE instances SET integ_status=? WHERE id=?", (json.dumps(summary), iid))
    values = {k: {"display": mask(k, env.get(k, "")), "set": env.get(k, "") not in PLACEHOLDERS,
                  "secret": k in SECRET_KEYS} for k in ALL_ENV}
    for k in ALL_SETTINGS:
        v = st.get(k)
        sv = "" if v is None else (v if isinstance(v, str) else json.dumps(v))
        values[k] = {"display": mask(k, sv), "set": v not in (None, "", False), "secret": k in SECRET_KEYS, "value": v}
    return {"values": values, "summary": summary, "public_urls": public_urls(inst, srv),
            "webhook_url": public_urls(inst, srv)["client_base_url"] + "/api/payments/webhook"}


class SaveIntegrations(BaseModel):
    env: dict[str, str] = {}        # blank / missing = keep
    settings: dict = {}             # values written as-is (bools, strings)
    clear: list[str] = []           # keys to reset to "not configured"


@app.post("/api/instances/{iid}/integrations")
def save_integrations(iid: int, body: SaveIntegrations):
    inst = instance(iid)
    env = {k: v.strip() for k, v in body.env.items() if k in ALL_ENV and v and v.strip()}
    sets = {k: v for k, v in body.settings.items() if k in ALL_SETTINGS and not (k in SECRET_KEYS and v in ("", None))}
    for k in body.clear:
        if k in ALL_ENV:
            env[k] = SANDBOX_ENV.get(k, "")
        elif k in ALL_SETTINGS:
            sets[k] = ""
    if any("\n" in v for v in env.values()):
        raise HTTPException(400, "values can't contain line breaks")
    if not env and not sets:
        raise HTTPException(400, "nothing to change")

    def run(log):
        ex_ = executor_for(server(inst["server_id"]))
        if sets:
            upsert_settings(ex_, inst, sets)
            log("Saved settings (live immediately): " + ", ".join(sorted(sets)))
        if env:
            envp = f"{inst['directory']}/.env"
            text = ex_.read(envp)
            for k, v in env.items():
                text = set_env_line(text, k, env_escape(v))
            ex_.write(envp, text)
            log("Updated .env: " + ", ".join(sorted(env)) + " — restarting the backend to load them…")
            log(ex_.sh(compose(inst, "up -d backend 2>&1")).strip()[-400:])
            wait_healthy(ex_, inst, log)
        _status_cache.clear()
    return {"job_id": start_job(f"Integrations for {inst['company']}", "integrations", run, instance_id=iid)}


def _http(method: str, url: str, headers: dict | None = None, auth: tuple | None = None, timeout=12):
    import base64
    import urllib.error
    import urllib.request
    h = dict(headers or {})
    h.setdefault("User-Agent", "rideflow-manager")
    if auth:
        h["Authorization"] = "Basic " + base64.b64encode(f"{auth[0]}:{auth[1]}".encode()).decode()
    req = urllib.request.Request(url, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode(errors="replace")
            return r.status, (json.loads(body) if body.strip().startswith(("{", "[")) else body)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(body)
        except Exception:  # noqa: BLE001
            return e.code, body
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def _err(body) -> str:
    if isinstance(body, dict):
        e = body.get("error") or body.get("message") or body.get("error_message") or body
        if isinstance(e, dict):
            e = e.get("message") or e
        return str(e)[:300]
    return str(body)[:300]


def test_stripe(v: dict, webhook_url: str) -> list:
    out = []
    key, wh = v.get("STRIPE_SECRET_KEY", ""), v.get("STRIPE_WEBHOOK_SECRET", "")
    if key in PLACEHOLDERS:
        return [{"label": "Secret key", "ok": None, "detail": "Not set — payments run in simulated (dev) mode"}]
    code, body = _http("GET", "https://api.stripe.com/v1/balance", {"Authorization": f"Bearer {key}"})
    mode = "LIVE (real money)" if key.startswith(("sk_live", "rk_live")) else "test mode"
    out.append({"label": "Secret key", "ok": code == 200, "detail": f"Valid — {mode}" if code == 200 else f"Rejected ({code}): {_err(body)}"})
    if code == 200:
        c2, b2 = _http("GET", "https://api.stripe.com/v1/webhook_endpoints?limit=100", {"Authorization": f"Bearer {key}"})
        if c2 == 200:
            eps = b2.get("data", [])
            hit = next((e for e in eps if e.get("url") == webhook_url), None)
            if hit:
                evs = hit.get("enabled_events", [])
                good = "*" in evs or "checkout.session.completed" in evs
                out.append({"label": "Webhook endpoint", "ok": good and hit.get("status") == "enabled",
                            "detail": f"Registered for {webhook_url} ({hit.get('status')})"
                                      + ("" if good else " — but it doesn't send checkout.session.completed")})
            else:
                urls = ", ".join(e.get("url", "") for e in eps[:4]) or "none"
                out.append({"label": "Webhook endpoint", "ok": False,
                            "detail": f"No endpoint for {webhook_url}. Add it in Stripe → Developers → Webhooks "
                                      f"(event checkout.session.completed). Existing: {urls}"})
        else:
            out.append({"label": "Webhook endpoint", "ok": None, "detail": f"Couldn't list webhooks ({c2}) — restricted key?"})
    if wh in PLACEHOLDERS:
        out.append({"label": "Webhook signing secret", "ok": False if key not in PLACEHOLDERS else None,
                    "detail": "Not set — webhook signatures are NOT verified"})
    else:
        out.append({"label": "Webhook signing secret", "ok": wh.startswith("whsec_"),
                    "detail": "Format OK (whsec_…). Stripe can't confirm it matches — copy it from the endpoint above."
                    if wh.startswith("whsec_") else "Should start with whsec_"})
    return out


def test_twilio(v: dict) -> list:
    sid, tok = v.get("TWILIO_ACCOUNT_SID", ""), v.get("TWILIO_AUTH_TOKEN", "")
    num, mg = v.get("TWILIO_PHONE_NUMBER", ""), v.get("TWILIO_MESSAGING_SERVICE_SID", "")
    if sid in PLACEHOLDERS:
        return [{"label": "Account", "ok": None, "detail": "Not set — SMS are only printed to the backend log"}]
    code, body = _http("GET", f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json", auth=(sid, tok))
    if code != 200:
        return [{"label": "Account", "ok": False, "detail": f"Rejected ({code}): {_err(body)}"}]
    out = [{"label": "Account", "ok": body.get("status") == "active",
            "detail": f"{body.get('friendly_name')} — status {body.get('status')}, type {body.get('type')}"}]
    if mg and mg not in PLACEHOLDERS:
        c, b = _http("GET", f"https://messaging.twilio.com/v1/Services/{mg}", auth=(sid, tok))
        if c == 200:
            c3, b3 = _http("GET", f"https://messaging.twilio.com/v1/Services/{mg}/PhoneNumbers?PageSize=50", auth=(sid, tok))
            n = len(b3.get("phone_numbers", [])) if c3 == 200 and isinstance(b3, dict) else "?"
            out.append({"label": "Messaging service", "ok": n not in (0,), "detail": f"{b.get('friendly_name')} — {n} sender number(s)"
                        + (" — EMPTY sender pool, SMS will fail" if n == 0 else "") + " (used instead of the phone number)"})
        else:
            out.append({"label": "Messaging service", "ok": False, "detail": f"Not found in this account ({c}): {_err(b)}"})
    if num and num not in PLACEHOLDERS:
        import urllib.parse
        c, b = _http("GET", f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json?PhoneNumber="
                     + urllib.parse.quote(num), auth=(sid, tok))
        found = c == 200 and isinstance(b, dict) and b.get("incoming_phone_numbers")
        out.append({"label": "Phone number", "ok": bool(found),
                    "detail": f"{num} belongs to this account" if found else f"{num} not found in this account"})
    elif not mg or mg in PLACEHOLDERS:
        out.append({"label": "Sender", "ok": False, "detail": "Set a phone number or a messaging service SID"})
    return out


def test_email(v: dict) -> list:
    key, frm = v.get("resend_api_key", "") or "", v.get("resend_from_email", "") or ""
    enabled = v.get("email_enabled")
    out = [{"label": "Email sending", "ok": True if enabled is True else None,
            "detail": "Enabled" if enabled is True else "Disabled — no emails are sent (toggle below)"}]
    if not key:
        out.append({"label": "Resend API key", "ok": None if enabled is not True else False, "detail": "Not set"})
        return out
    code, body = _http("GET", "https://api.resend.com/domains", {"Authorization": f"Bearer {key}"})
    if code == 401 or (code in (400, 403) and "restricted" in json.dumps(body)):
        if code == 401 and "restricted" not in json.dumps(body):
            out.append({"label": "Resend API key", "ok": False, "detail": f"Rejected: {_err(body)}"})
            return out
        out.append({"label": "Resend API key", "ok": True, "detail": "Valid (sending-only key, can't list domains)"})
        return out
    if code != 200:
        out.append({"label": "Resend API key", "ok": False, "detail": f"Rejected ({code}): {_err(body)}"})
        return out
    doms = body.get("data", []) if isinstance(body, dict) else []
    out.append({"label": "Resend API key", "ok": True, "detail": f"Valid — {len(doms)} domain(s) in the account"})
    dom = frm.split("@")[-1].lower() if "@" in frm else ""
    if not dom:
        out.append({"label": "From address", "ok": False, "detail": "Set a from address like bookings@yourdomain.com"})
    else:
        d = next((x for x in doms if x.get("name", "").lower() == dom), None)
        if not d:
            out.append({"label": "From address", "ok": False, "detail": f"Domain {dom} isn't added in Resend — add + verify it there"})
        else:
            out.append({"label": "From address", "ok": d.get("status") == "verified", "detail": f"{frm} — domain {dom} is {d.get('status')}"})
    return out


def test_maps(v: dict) -> list:
    key = v.get("GOOGLE_MAPS_API_KEY", "")
    if key in PLACEHOLDERS:
        return [{"label": "API key", "ok": None, "detail": "Not set — address boxes fall back to plain text"}]
    code, body = _http("GET", f"https://maps.googleapis.com/maps/api/geocode/json?address=Times+Square+New+York&key={key}")
    st = body.get("status") if isinstance(body, dict) else None
    if st == "OK":
        return [{"label": "Geocoding API", "ok": True, "detail": "Key works"}]
    msg = body.get("error_message", "") if isinstance(body, dict) else str(body)
    if "referer" in msg.lower():
        return [{"label": "API key", "ok": None, "detail": "Key is restricted to websites (HTTP referrers) — fine for the "
                 "address boxes, can't be tested from the server"}]
    return [{"label": "Geocoding API", "ok": False, "detail": f"{st}: {msg}"[:300]}]


class TestIntegration(BaseModel):
    values: dict = {}   # unsaved form values override the current ones


@app.post("/api/instances/{iid}/integrations/test/{service}")
def test_integration(iid: int, service: str, body: TestIntegration):
    if service not in ("stripe", "twilio", "email", "maps"):
        raise HTTPException(400, "unknown service")
    inst = instance(iid)
    srv = server(inst["server_id"])
    ex_ = executor_for(srv)
    vals: dict = {}
    if service in INTEG_ENV:
        vals.update(effective_env(inst, ex_))
    if service in INTEG_SETTINGS:
        vals.update(current_settings(inst, ex_, INTEG_SETTINGS[service]))
    vals.update({k: v for k, v in body.values.items() if v not in ("", None)})
    if service == "stripe":
        checks = test_stripe(vals, public_urls(inst, srv)["client_base_url"] + "/api/payments/webhook")
    elif service == "twilio":
        checks = test_twilio(vals)
    elif service == "email":
        checks = test_email(vals)
    else:
        checks = test_maps(vals)
    return {"checks": checks, "ok": all(c["ok"] is not False for c in checks)}


# ─── Instance details page ─────────────────────────────────────────────────

DETAIL_COUNTS = ["bookings", "payments", "drivers", "hotels", "cashiers", "concierges", "vehicle_rates",
                 "common_routes", "admins", "ratings"]


@app.get("/api/instances/{iid}/details")
def instance_details(iid: int):
    """Everything about one instance for the details page. Each part fails soft."""
    inst = instance(iid)
    srv = server(inst["server_id"])
    out = {"instance": inst, "server": {k: srv[k] for k in ("id", "name", "host", "is_local")},
           "public_host": srv_public_host(srv), "latest_tag": latest_tag(), "errors": {}}
    try:
        ex_ = executor_for(srv)
    except Exception as e:  # noqa: BLE001
        out["errors"]["server"] = str(e)
        return out
    proj = shlex.quote(inst["project"])

    try:
        rows = ex_.sh(f"docker ps -a --filter label=com.docker.compose.project={proj} --format "
                      "'{{.Label \"com.docker.compose.service\"}}|{{.State}}|{{.Status}}|{{.Image}}|{{.Names}}'")
        stats = {}
        st_out = ex_.sh(f"docker stats --no-stream --format '{{{{.Name}}}}|{{{{.CPUPerc}}}}|{{{{.MemUsage}}}}' "
                        f"$(docker ps -q --filter label=com.docker.compose.project={proj}) 2>/dev/null || true", check=False)
        for ln in st_out.splitlines():
            parts = ln.split("|")
            if len(parts) == 3:
                stats[parts[0]] = {"cpu": parts[1], "mem": parts[2].split(" / ")[0]}
        order = ["website", "client", "staff", "backend", "db"]
        svcs = []
        for ln in rows.splitlines():
            parts = ln.split("|")
            if len(parts) == 5:
                svcs.append({"service": parts[0], "state": parts[1], "status": parts[2], "image": parts[3],
                             **stats.get(parts[4], {})})
        out["containers"] = sorted(svcs, key=lambda c: order.index(c["service"]) if c["service"] in order else 9)
    except Exception as e:  # noqa: BLE001
        out["errors"]["containers"] = str(e)

    try:
        sql = ("SELECT json_build_object('size', pg_size_pretty(pg_database_size('rideflow')), "
               + ", ".join(f"'{t}', (SELECT count(*) FROM {t})" for t in DETAIL_COUNTS)
               + ", 'last_booking', (SELECT max(created_at) FROM bookings)"
               + ", 'company_name', (SELECT value #>> '{}' FROM settings WHERE key='company_name')"
               + ", 'brand_primary_color', (SELECT value #>> '{}' FROM settings WHERE key='brand_primary_color')"
               + ", 'company_logo_url', (SELECT value #>> '{}' FROM settings WHERE key='company_logo_url'))")
        _, o = ex_.run(compose(inst, "exec -T db psql -U rideflow -d rideflow -At -v ON_ERROR_STOP=1"),
                       input_bytes=sql.encode(), binary=True)
        out["db"] = json.loads(o.decode())
    except Exception as e:  # noqa: BLE001
        out["errors"]["db"] = "database not reachable (is the instance stopped?)"

    if isinstance(ex_, RemoteExec):
        ex_.close()
    prefix = f"{inst['slug']}-s{inst['server_id']}-"
    out["backups"] = [b for b in list_backups() if b["name"].startswith(prefix)][:10]
    out["jobs"] = q("SELECT id, title, kind, status, created_at, finished_at FROM jobs WHERE instance_id=? "
                    "ORDER BY id DESC LIMIT 12", (iid,))
    return out


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


class ConfirmPassword(BaseModel):
    password: str


def check_password(password: str, request: Request):
    """Re-confirm the manager password for destructive actions (shares the login rate limit)."""
    ip = request.client.host if request.client else "?"
    recent = [t for t in _login_attempts.get(ip, []) if time.time() - t < 600]
    if len(recent) >= 10:
        raise HTTPException(429, "Too many wrong passwords, wait 10 minutes")
    if not PASSWORD or not hmac.compare_digest(password, PASSWORD):
        _login_attempts[ip] = recent + [time.time()]
        raise HTTPException(403, "Wrong password")


class UpdateAccount(BaseModel):
    current_password: str
    new_username: str = ""      # empty = keep
    new_password: str = ""      # empty = keep


def write_env_value(key: str, value: str):
    """Replace KEY=... in the manager's env file (systemd EnvironmentFile syntax), atomically."""
    quoted = '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    out, done = [], False
    for ln in lines:
        if ln.startswith(f"{key}="):
            out.append(f"{key}={quoted}")
            done = True
        else:
            out.append(ln)
    if not done:
        out.append(f"{key}={quoted}")
    tmp = ENV_FILE.with_suffix(".tmp")
    tmp.write_text("\n".join(out) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ENV_FILE)


@app.get("/api/account")
def get_account():
    return {"username": USER}


@app.post("/api/account")
def update_account(body: UpdateAccount, request: Request):
    """Change the manager login (username and/or password). Needs the current password."""
    global PASSWORD, USER
    check_password(body.current_password, request)
    new_user = body.new_username.strip()
    new_pw = body.new_password
    if not new_user and not new_pw:
        raise HTTPException(400, "Nothing to change")
    if new_user and new_user == USER and not new_pw:
        raise HTTPException(400, "That's already the username")
    if new_user and not re.fullmatch(r"[A-Za-z0-9._@-]{3,40}", new_user):
        raise HTTPException(400, "Username: 3–40 characters — letters, numbers, . _ @ -")
    if new_pw:
        if len(new_pw) < 10:
            raise HTTPException(400, "New password must be at least 10 characters")
        if new_pw == body.current_password:
            raise HTTPException(400, "New password must be different from the current one")
        if any(c in new_pw for c in "\r\n"):
            raise HTTPException(400, "Password can't contain line breaks")
    if new_user:
        write_env_value("RFM_USER", new_user)
        USER = new_user
    if new_pw:
        write_env_value("RFM_PASSWORD", new_pw)
        PASSWORD = new_pw
    # Other sessions are now invalid (user + password are part of the signing key) — keep this one.
    resp = JSONResponse({"ok": True, "username": USER})
    resp.set_cookie("rfm_session", make_session(), httponly=True, samesite="strict", max_age=12 * 3600,
                    secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https")
    return resp


@app.post("/api/backups/{name}/delete")
def delete_backup(name: str, body: ConfirmPassword, request: Request):
    check_password(body.password, request)
    p = (BACKUPS / name).resolve()
    if p.parent != BACKUPS.resolve() or not p.name.endswith(".dump") or not p.exists():
        raise HTTPException(404, "backup not found")
    p.unlink()
    return {"ok": True, "deleted": name}


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
