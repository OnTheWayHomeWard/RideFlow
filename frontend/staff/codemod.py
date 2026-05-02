"""
Codemod for staff portal lift.
For each role (admin/driver/cashier):
  - Rewrites import paths inside lifted pages/components/api files.
  - Prefixes route paths in `to=`, `navigate(`, `window.location.href = ` calls.
Runs once. Idempotent (skips paths already prefixed with /<role>/).
"""
from pathlib import Path
import re

ROOT = Path(__file__).parent / "src"

ROLES = {
    "admin":   {"client": "adminClient",   "components_dir": "admin"},
    "driver":  {"client": "driverClient",  "components_dir": "driver"},
    "cashier": {"client": "cashierClient", "components_dir": "cashier"},
}

# Paths that must NEVER get role-prefixed (public/top-level routes).
PUBLIC_PATHS = (
    "/concierge-onboarding",
    "/concierge-batch",
)

def is_public(path: str) -> bool:
    for p in PUBLIC_PATHS:
        if path == p or path.startswith(p + "/") or path.startswith(p + "?"):
            return True
    return False

def prefix_path(path: str, role: str) -> str:
    """Add /<role> prefix to a path string. Idempotent + skips public paths."""
    if not path.startswith("/"):
        return path
    if is_public(path):
        return path
    role_root = "/" + role
    if path == role_root or path.startswith(role_root + "/"):
        return path
    if path == "/":
        return role_root
    return role_root + path

def fix_file(fp: Path, role: str, info: dict, in_role_subfolder: bool):
    text = fp.read_text(encoding="utf-8")
    orig = text

    # ── 1. Import path fixes ──
    if in_role_subfolder:
        # Files live in pages/<role>/ or components/<role>/ (one level deeper than original)
        # Original imports were like ../api/client; now need ../../api/<role>Client
        text = re.sub(
            r"""from\s+(['"])\.\./api/client\1""",
            f"from \\1../../api/{info['client']}\\1",
            text,
        )
        # ../components/X → ../../components/<role>/X  (only if X is not already namespaced)
        text = re.sub(
            r"""from\s+(['"])\.\./components/([A-Za-z0-9_./-]+?)\1""",
            lambda m: f"from {m.group(1)}../../components/{info['components_dir']}/{m.group(2)}{m.group(1)}",
            text,
        )
        text = re.sub(
            r"""from\s+(['"])\.\./hooks/([A-Za-z0-9_./-]+?)\1""",
            r"from \1../../hooks/\2\1",
            text,
        )
        text = re.sub(
            r"""from\s+(['"])\.\./assets/([A-Za-z0-9_./-]+?)\1""",
            r"from \1../../assets/\2\1",
            text,
        )

    # ── 2. Route prefix in Link to="..." ──
    def repl_to_str(m):
        quote, path = m.group(1), m.group(2)
        return f'to={quote}{prefix_path(path, role)}{quote}'
    text = re.sub(r'to=(["\'])(/[A-Za-z0-9_/?&=.-]*)\1', repl_to_str, text)

    # ── 3. Route prefix in navigate("...") ──
    def repl_navigate_str(m):
        quote, path = m.group(1), m.group(2)
        return f'navigate({quote}{prefix_path(path, role)}{quote})'
    text = re.sub(r'navigate\(\s*(["\'])(/[A-Za-z0-9_/?&=.-]*)\1\s*\)', repl_navigate_str, text)

    # ── 4. Route prefix in template-literal Link/navigate (e.g. to={`/runs/${id}`}) ──
    def repl_to_template(m):
        path = m.group(1)  # the `/runs/...` part inside the backticks
        # Path comes from a backtick template; we only prefix the literal head before any ${}
        # Simpler: rebuild by prefix-checking the literal portion up to first `${` or end.
        head_match = re.match(r'(/[A-Za-z0-9_/?&=.-]*)', path)
        if not head_match:
            return m.group(0)
        head = head_match.group(1)
        if is_public(head):
            return m.group(0)
        new_head = prefix_path(head, role)
        if new_head == head:
            return m.group(0)
        rest = path[len(head):]
        return f'to={{`{new_head}{rest}`}}'
    text = re.sub(r'to=\{`(/[^`]*)`\}', repl_to_template, text)

    def repl_nav_template(m):
        path = m.group(1)
        head_match = re.match(r'(/[A-Za-z0-9_/?&=.-]*)', path)
        if not head_match:
            return m.group(0)
        head = head_match.group(1)
        if is_public(head):
            return m.group(0)
        new_head = prefix_path(head, role)
        if new_head == head:
            return m.group(0)
        rest = path[len(head):]
        return f'navigate(`{new_head}{rest}`)'
    text = re.sub(r'navigate\(\s*`(/[^`]*)`\s*\)', repl_nav_template, text)

    # ── 5. window.location.href = '/x' (literal) ──
    def repl_winloc(m):
        quote, path = m.group(1), m.group(2)
        return f'window.location.href = {quote}{prefix_path(path, role)}{quote}'
    text = re.sub(
        r'window\.location\.href\s*=\s*(["\'])(/[A-Za-z0-9_/?&=.-]*)\1',
        repl_winloc, text,
    )

    # ── 6. window.location.href = `/x${...}` (template) ──
    def repl_winloc_tmpl(m):
        path = m.group(1)
        head_match = re.match(r'(/[A-Za-z0-9_/?&=.-]*)', path)
        if not head_match:
            return m.group(0)
        head = head_match.group(1)
        if is_public(head):
            return m.group(0)
        new_head = prefix_path(head, role)
        if new_head == head:
            return m.group(0)
        rest = path[len(head):]
        return f'window.location.href = `{new_head}{rest}`'
    text = re.sub(
        r'window\.location\.href\s*=\s*`(/[^`]*)`',
        repl_winloc_tmpl, text,
    )

    if text != orig:
        fp.write_text(text, encoding="utf-8")
        print(f"  patched: {fp.relative_to(ROOT)}")

def run():
    for role, info in ROLES.items():
        print(f"\n=== {role} ===")
        # Files inside pages/<role>/ and components/<role>/ — one level deeper
        for sub in ("pages", "components"):
            d = ROOT / sub / info["components_dir"]
            if not d.exists():
                continue
            for fp in d.rglob("*.jsx"):
                fix_file(fp, role, info, in_role_subfolder=True)
            for fp in d.rglob("*.js"):
                fix_file(fp, role, info, in_role_subfolder=True)
        # The {Role}App.jsx file at staff/src/{Role}App.jsx — same level as before (just imports paths and route prefixes)
        # For App files, in_role_subfolder=False (their imports stay at the original depth)
        app_file = ROOT / f"{role.capitalize()}App.jsx"
        if app_file.exists():
            fix_file(app_file, role, info, in_role_subfolder=False)

if __name__ == "__main__":
    run()
    print("\nDone.")
