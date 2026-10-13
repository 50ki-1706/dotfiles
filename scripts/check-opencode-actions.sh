#!/usr/bin/env bash
# OpenCode action-space drift checker.
#
# Compares the effective action space of the pinned OpenCode runtime against the
# baseline in modules/opencode/actions.nix (baked in by
# packages/opencode-action-check.nix) and live-introspects the configured MCP
# servers (initialize -> tools/list over stdio, never tools/call).
#
# Exit codes: 0 = OK, 1 = drift, 2 = inconclusive (infra/skip; drift 判定保留).
#
# Fixture flags for tests (offline):
#   --rules-file <debug-agents.json>  CHECK A input instead of `opencode debug agents`
#   --tools-file <tools.json>         CHECK B input {server or key: [tools...]}
#   --servers-file <mcp.json>         MCP server config override (opencode.json shape)
set -euo pipefail

BASELINE_JSON="${OPENCODE_ACTION_BASELINE:-}"
WORKDIR="$(pwd)"
HOME_OVERRIDE=""
RULES_FILE=""
TOOLS_FILE=""
SERVERS_FILE=""
CAPTURE=0
SKIP_INTROSPECTION=0
MCP_TIMEOUT=60

usage() {
  cat <<'EOF'
usage: opencode-action-check [options]

  --baseline <file>        baseline JSON (required unless baked in by the flake)
  --home <gen-path>        isolated HOME: copy <gen>/home-files/.config/opencode
                           into a temp HOME and capture agents there
  --workdir <dir>          directory for project config and MCP server cwd (default: pwd)
  --rules-file <file>      fixture: debug-agents JSON for CHECK A
  --tools-file <file>      fixture: captured MCP tools for CHECK B
  --servers-file <file>    fixture: MCP server config override
  --capture                print a candidate baseline JSON to stdout (never writes files)
  --skip-introspection     skip CHECK B (overall exit 2, never 0)
  --mcp-timeout <seconds>  per-server timeout (default: 60)
  -h, --help               show this help
EOF
}

require_value() {
  if [ "$#" -lt 2 ]; then
    echo "missing value for $1" >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --baseline)
      require_value "$@"
      BASELINE_JSON="$2"
      shift 2
      ;;
    --home)
      require_value "$@"
      HOME_OVERRIDE="$2"
      shift 2
      ;;
    --workdir)
      require_value "$@"
      WORKDIR="$2"
      shift 2
      ;;
    --rules-file)
      require_value "$@"
      RULES_FILE="$2"
      shift 2
      ;;
    --tools-file)
      require_value "$@"
      TOOLS_FILE="$2"
      shift 2
      ;;
    --servers-file)
      require_value "$@"
      SERVERS_FILE="$2"
      shift 2
      ;;
    --capture)
      CAPTURE=1
      shift
      ;;
    --skip-introspection)
      SKIP_INTROSPECTION=1
      shift
      ;;
    --mcp-timeout)
      require_value "$@"
      MCP_TIMEOUT="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$BASELINE_JSON" ]; then
  echo "error: --baseline <baseline.json> is required (or run via nix run .#opencodeActionCheck)" >&2
  exit 2
fi

export OC_BASELINE="$BASELINE_JSON"
export OC_WORKDIR="$WORKDIR"
export OC_HOME_OVERRIDE="$HOME_OVERRIDE"
export OC_RULES_FILE="$RULES_FILE"
export OC_TOOLS_FILE="$TOOLS_FILE"
export OC_SERVERS_FILE="$SERVERS_FILE"
export OC_CAPTURE="$CAPTURE"
export OC_SKIP_INTROSPECTION="$SKIP_INTROSPECTION"
export OC_MCP_TIMEOUT="$MCP_TIMEOUT"

python3 - <<'PY'
# Embedded checker body. Kept dependency-free (python3 stdlib + opencode binary)
# so the flake wrapper only needs python3 and the pinned opencode on PATH.
import base64
import json
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

EXIT_OK = 0
EXIT_DRIFT = 1
EXIT_INCONCLUSIVE = 2

BASELINE = os.environ.get("OC_BASELINE", "")
WORKDIR = os.path.abspath(os.environ.get("OC_WORKDIR") or os.getcwd())
HOME_OVERRIDE = os.environ.get("OC_HOME_OVERRIDE", "")
RULES_FILE = os.environ.get("OC_RULES_FILE", "")
TOOLS_FILE = os.environ.get("OC_TOOLS_FILE", "")
SERVERS_FILE = os.environ.get("OC_SERVERS_FILE", "")
CAPTURE = os.environ.get("OC_CAPTURE") == "1"
SKIP_INTROSPECTION = os.environ.get("OC_SKIP_INTROSPECTION") == "1"
try:
    MCP_TIMEOUT = float(os.environ.get("OC_MCP_TIMEOUT") or "60")
except ValueError:
    MCP_TIMEOUT = 60.0
OPENCODE = shutil.which("opencode") or ""

ISOLATED_HOME = None
EXPECTED_SERVERS = set()


def log(message):
    target = sys.stderr if CAPTURE else sys.stdout
    print(message, flush=True, file=target)


def sanitize(name):
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)


def action_for(server, tool):
    return "{}_{}".format(sanitize(server), sanitize(tool))


def baseline_key(server):
    parts = re.split(r"[-_]", server)
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def run_command(command, timeout):
    try:
        proc = subprocess.run(command, cwd=WORKDIR, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        return None, str(error)
    if proc.returncode != 0:
        return None, "exit {}: {}".format(proc.returncode, (proc.stderr or "").strip()[:200])
    return proc.stdout, None


def prepare_isolated_home():
    global ISOLATED_HOME
    source = os.path.join(HOME_OVERRIDE, "home-files", ".config", "opencode")
    if not os.path.isdir(source):
        fallback = os.path.join(HOME_OVERRIDE, ".config", "opencode")
        if os.path.isdir(fallback):
            ISOLATED_HOME = HOME_OVERRIDE
            return True
        log("error: {} は home-manager generation でも HOME でもありません".format(HOME_OVERRIDE))
        return False
    tmp = tempfile.mkdtemp(prefix="opencode-action-check-home.")
    destination = os.path.join(tmp, ".config", "opencode")
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copytree(source, destination)
    for root, dirs, files in os.walk(destination):
        os.chmod(root, 0o755)
        for name in files:
            path = os.path.join(root, name)
            if not os.path.islink(path):
                os.chmod(path, 0o644)
    # Keep any opencode CLI invocation in this HOME standalone (no managed
    # service, no port collision with the user's running service).
    with open(os.path.join(destination, "service.json"), "w", encoding="utf-8") as handle:
        handle.write('{"disabled": true}\n')
    ISOLATED_HOME = tmp
    return True


def config_directory():
    if ISOLATED_HOME:
        return os.path.join(ISOLATED_HOME, ".config", "opencode")
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        return os.path.join(xdg, "opencode")
    return os.path.join(os.path.expanduser("~"), ".config", "opencode")


def mcp_servers_from_config():
    if SERVERS_FILE:
        data = load_json(SERVERS_FILE)
    else:
        path = os.path.join(config_directory(), "opencode.json")
        if not os.path.exists(path):
            return {}
        data = load_json(path)
    if isinstance(data, dict) and isinstance(data.get("servers"), dict):
        return data["servers"]
    mcp = data.get("mcp") if isinstance(data, dict) else None
    if isinstance(mcp, dict) and isinstance(mcp.get("servers"), dict):
        return mcp["servers"]
    return {}


def make_line_reader(fd):
    buffer = {"value": b""}

    def read_line(deadline):
        while time.time() < deadline:
            if b"\n" in buffer["value"]:
                line, buffer["value"] = buffer["value"].split(b"\n", 1)
                return line.decode("utf-8", "replace")
            remaining = deadline - time.time()
            ready, _, _ = select.select([fd], [], [], max(0.1, min(remaining, 1.0)))
            if not ready:
                continue
            chunk = os.read(fd, 65536)
            if not chunk:
                return None
            buffer["value"] += chunk
        return None

    return read_line


def send_json(proc, payload):
    proc.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
    proc.stdin.flush()


def read_response(read_line, wanted_id, deadline):
    while True:
        line = read_line(deadline)
        if line is None:
            return None
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(message, dict) and message.get("id") == wanted_id:
            return message


def terminate_group(pgid, grace=5.0):
    try:
        os.killpg(pgid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return
    deadline = time.time() + grace
    while time.time() < deadline:
        try:
            os.killpg(pgid, 0)
        except (ProcessLookupError, PermissionError):
            return
        time.sleep(0.2)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def servers_from_fixture(fixture):
    servers = {}
    for key, tools in fixture.items():
        server = key if key in EXPECTED_SERVERS else key.replace("_", "-")
        if server not in EXPECTED_SERVERS:
            server = key
        prefix = sanitize(server) + "_"
        names = []
        for tool in tools or []:
            raw = tool[len(prefix):] if isinstance(tool, str) and tool.startswith(prefix) else tool
            names.append(action_for(server, raw))
        servers[server] = sorted(set(names))
    return servers


def introspect(server, config):
    """MCP stdio introspection: initialize -> notifications/initialized -> tools/list."""
    result = {"status": "STARTUP_FAIL", "tools": [], "error": None, "stderr": ""}
    command = config.get("command") or []
    if not command:
        result["error"] = "server config has no command"
        return result
    cwd = config.get("cwd") or WORKDIR
    environment = dict(os.environ)
    for key, value in (config.get("environment") or {}).items():
        environment[str(key)] = str(value)
    environment.setdefault(
        "PATH",
        "/Users/koki/.nix-profile/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    )
    stderr_file = tempfile.NamedTemporaryFile(mode="w+", suffix=".stderr", delete=False)
    try:
        try:
            proc = subprocess.Popen(
                [str(part) for part in command],
                cwd=cwd,
                env=environment,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=stderr_file,
                start_new_session=True,
            )
        except OSError as error:
            result["error"] = "spawn failed: {}".format(error)
            return result
        pgid = os.getpgid(proc.pid)
        read_line = make_line_reader(proc.stdout.fileno())
        try:
            deadline = time.time() + MCP_TIMEOUT
            send_json(
                proc,
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {},
                        "clientInfo": {"name": "opencode-action-check", "version": "1.0"},
                    },
                },
            )
            response = read_response(read_line, 1, deadline)
            if response is None:
                result["status"] = "STARTUP_FAIL" if proc.poll() is not None else "TIMEOUT"
                result["error"] = "no initialize response"
            elif "error" in response:
                result["status"] = "RPC_ERROR"
                result["error"] = json.dumps(response["error"])[:300]
            else:
                send_json(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})
                tools = set()
                cursor = None
                for page in range(10):
                    request = {"jsonrpc": "2.0", "id": 100 + page, "method": "tools/list", "params": {}}
                    if cursor:
                        request["params"]["cursor"] = cursor
                    send_json(proc, request)
                    response = read_response(read_line, 100 + page, deadline)
                    if response is None:
                        result["status"] = "TIMEOUT"
                        result["error"] = "no tools/list response on page {}".format(page)
                        break
                    if "error" in response:
                        result["status"] = "RPC_ERROR"
                        result["error"] = json.dumps(response["error"])[:300]
                        break
                    payload = response.get("result") or {}
                    for tool in payload.get("tools") or []:
                        name = tool.get("name")
                        if name:
                            tools.add(name)
                    cursor = payload.get("nextCursor")
                    if not cursor:
                        result["status"] = "OK"
                        result["tools"] = sorted(tools)
                        break
                else:
                    result["status"] = "INCONCLUSIVE"
                    result["error"] = "cursor pagination exceeded 10 pages"
        finally:
            terminate_group(pgid)
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                except OSError:
                    pass
            try:
                stderr_file.flush()
                with open(stderr_file.name, "r", encoding="utf-8", errors="replace") as handle:
                    result["stderr"] = handle.read()[-300:]
            except OSError:
                pass
    finally:
        try:
            os.unlink(stderr_file.name)
        except OSError:
            pass
    return result


def collect_agents():
    """Returns (agents, source, error)."""
    if RULES_FILE:
        try:
            return load_json(RULES_FILE), "--rules-file {}".format(RULES_FILE), None
        except (OSError, json.JSONDecodeError) as error:
            return None, "--rules-file {}".format(RULES_FILE), str(error)
    if HOME_OVERRIDE:
        agents, error = capture_agents_isolated()
        return agents, "serve --stdio (HOME={})".format(ISOLATED_HOME or HOME_OVERRIDE), error
    if not OPENCODE:
        return None, "opencode", "opencode binary not found on PATH"
    timeout = max(120.0, MCP_TIMEOUT * 2)
    last_error = None
    for attempt in (1, 2):
        output, error = run_command([OPENCODE, "debug", "agents"], timeout)
        if error is None:
            try:
                agents = json.loads(output)
            except json.JSONDecodeError as parse_error:
                last_error = "invalid JSON: {}".format(parse_error)
                agents = None
            else:
                if agents:
                    return agents, "opencode debug agents", None
                last_error = "no agents returned"
        else:
            last_error = error
        if attempt == 1:
            # Fresh managed service can answer before config plugins finish; a
            # warm service (retry) returns the full list.
            time.sleep(3)
    return None, "opencode debug agents", last_error


def capture_agents_isolated():
    """Isolated HOME capture.

    `opencode debug agents` runs its standalone server and polls it before the
    config plugins finish (observed on v2.0.22: returns []), so we spawn
    `serve --stdio --port 0` ourselves and poll /api/agent until non-empty.
    """
    environment = dict(os.environ)
    environment["HOME"] = ISOLATED_HOME
    environment["OPENCODE_PASSWORD"] = "oc-action-check"
    try:
        proc = subprocess.Popen(
            [OPENCODE, "serve", "--stdio", "--port", "0"],
            cwd=WORKDIR,
            env=environment,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as error:
        return None, "spawn failed: {}".format(error)
    pgid = os.getpgid(proc.pid)
    read_line = make_line_reader(proc.stdout.fileno())
    try:
        deadline = time.time() + max(30.0, MCP_TIMEOUT)
        url = None
        while url is None:
            line = read_line(deadline)
            if line is None:
                return None, "standalone server did not report readiness"
            try:
                url = json.loads(line).get("url")
            except json.JSONDecodeError:
                continue
        auth = base64.b64encode(b"opencode:oc-action-check").decode()
        query = urllib.parse.urlencode({"location[directory]": WORKDIR})
        endpoint = "{}/api/agent?{}".format(url, query)
        while time.time() < deadline:
            request = urllib.request.Request(endpoint, headers={"Authorization": "Basic " + auth})
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                agents = payload.get("data") or []
            except Exception:
                agents = []
            if agents:
                return agents, None
            time.sleep(0.5)
        return None, "no agents returned from {}".format(url)
    finally:
        terminate_group(pgid)
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
            except OSError:
                pass


def check_rules(agents, baseline):
    observed = set()
    for agent in agents or []:
        if not isinstance(agent, dict):
            continue
        for rule in agent.get("permissions") or []:
            action = rule.get("action")
            if isinstance(action, str) and action != "*":
                observed.add(action)
    known = set(baseline["ruleActions"])
    expected = set(baseline["expectedRuleActions"])
    additions = sorted(observed - known)
    removals = sorted(expected - observed)
    return observed, additions, removals


def resolve_server_tools(baseline):
    """Returns (results, captured_by_server, inconclusive, additions, removals, renames).

    results: list of (server, status, count, detail)
    captured_by_server: {server: [full action names]} for OK servers
    """
    expected_servers = baseline["mcpServers"]
    allowlist = set(baseline["mcpIntrospectAllowlist"])
    fixture = servers_from_fixture(load_json(TOOLS_FILE)) if TOOLS_FILE else None
    servers_config = None if fixture is not None else mcp_servers_from_config()
    results = []
    captured_by_server = {}
    inconclusive = []
    additions = []
    removals = []
    renames = []
    for server in expected_servers:
        key = baseline_key(server)
        expected_names = sorted(baseline["mcpToolActions"].get(key) or [])
        if SKIP_INTROSPECTION:
            results.append((server, "SKIPPED", 0, ""))
            continue
        if fixture is not None:
            if server not in fixture:
                results.append((server, "FIXTURE_MISSING", 0, ""))
                inconclusive.append("{}: tools フィクスチャに無いため判定不可".format(server))
                continue
            status, detail = "OK", "fixture"
            captured = sorted(fixture[server])
        else:
            if server not in allowlist:
                results.append((server, "NOT_ALLOWED", 0, ""))
                inconclusive.append("{}: introspection allowlist に含まれないため skip".format(server))
                continue
            config = (servers_config or {}).get(server)
            if not config:
                results.append((server, "MISSING_CONFIG", 0, ""))
                inconclusive.append("{}: MCP サーバー設定が見つからない".format(server))
                continue
            probe = introspect(server, config)
            status = probe["status"]
            if status == "OK":
                detail = ""
            else:
                detail = (probe.get("error") or probe.get("stderr") or "").strip()[:160]
            captured = sorted(action_for(server, tool) for tool in probe.get("tools") or [])
        results.append((server, status, len(captured), detail))
        if status != "OK":
            inconclusive.append("{}: {} ({})".format(server, status, detail))
            continue
        captured_by_server[server] = captured
        prefix = sanitize(server) + "_"
        captured_set = set(captured)
        expected_set = set(expected_names)
        suffix_captured = {name[len(prefix):] for name in captured_set if name.startswith(prefix)}
        for name in sorted(captured_set - expected_set):
            additions.append((server, name))
        for name in sorted(expected_set - captured_set):
            suffix = name[len(prefix):] if name.startswith(prefix) else name
            if suffix in suffix_captured:
                renames.append((server, name))
            else:
                removals.append((server, name))
    return results, captured_by_server, inconclusive, additions, removals, renames


def health_check(baseline):
    if not OPENCODE or TOOLS_FILE:
        return
    environment = dict(os.environ)
    if ISOLATED_HOME:
        environment["HOME"] = ISOLATED_HOME
    try:
        proc = subprocess.run(
            [OPENCODE, "mcp", "list"],
            cwd=WORKDIR,
            env=environment,
            capture_output=True,
            text=True,
            timeout=max(30.0, MCP_TIMEOUT),
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        log("[health] opencode mcp list 実行不可: {}".format(error))
        return
    statuses = {}
    for line in (proc.stdout or "").splitlines():
        match = re.match(r"^\s*\S+\s+([A-Za-z0-9._-]+)\s+([a-z_]+)\s*$", line)
        if match:
            statuses[match.group(1)] = match.group(2)
    if not statuses:
        log("[health] opencode mcp list の出力を解析できませんでした（best-effort、判定には未使用）")
        return
    for server in baseline["mcpServers"]:
        status = statuses.get(server, "unknown")
        if status != "connected":
            log("[health] warning: {} status={}（判定には未使用）".format(server, status))


def print_rule_section(observed, additions, removals, source, error):
    log("")
    log("[CHECK A] ルール action 空間 ({})".format(source))
    if error:
        log("  実行不可: {}".format(error))
        return
    log("  観測 {} actions".format(len(observed)))
    if not additions and not removals:
        log("  OK: 追加・削除なし")
        return
    if additions:
        log("  追加 (baseline 未登録: 現行の deny 方針では fail-closed になります):")
        for action in additions:
            log("    + {}".format(action))
    if removals:
        log("  削除 (baseline にあるが観測されない):")
        for action in removals:
            log("    - {}".format(action))


def print_mcp_section(results, additions, removals, renames):
    log("")
    log("[CHECK B] MCP ツール一覧 (initialize -> tools/list, tools/call は行わない)")
    for server, status, count, detail in results:
        suffix = " ({})".format(detail) if detail else ""
        log("  {}: {}{} ({} tools)".format(server, status, suffix, count))
    for server, name in additions:
        log("    + {}/{}".format(server, name))
    for server, name in removals:
        log("    - {}/{}".format(server, name))
    for server, name in renames:
        log("    ~ {}/{} (action 変更の疑い)".format(server, name))


def print_fix_block():
    log("")
    log("修正手順:")
    log("  1. 追加項目はアクセス付与を意味します。ユーザー承認なしに allow-list へ追加しないでください。")
    log("     削除項目は上流削除かサーバー障害か区別できない場合、`opencode mcp list` と")
    log("     ~/.local/share/opencode/log を確認してください。")
    log("  2. modules/opencode/actions.nix を更新（ruleActions / expectedRuleActions / mcpToolActions）。")
    log("  3. nix run home-manager -- build --flake .#koki")
    log("  4. nix run .#opencodeActionCheck -- --home ./result  で候補 generation を検証")
    log("  5. switch はユーザーの明示依頼時のみ実行")


def run_capture_mode(agents, source, error, baseline):
    if not agents:
        log("error: capture に必要な agents を取得できません: {}".format(error or source))
        return EXIT_INCONCLUSIVE
    observed, _, _ = check_rules(agents, baseline)
    capture = {"ruleActions": sorted(observed), "mcpToolActions": {}}
    inconclusive = []
    if SKIP_INTROSPECTION:
        inconclusive.append("--skip-introspection のため MCP 未取得")
    else:
        try:
            results, captured, mcp_inconclusive, _, _, _ = resolve_server_tools(baseline)
            inconclusive.extend(mcp_inconclusive)
            for server in baseline["mcpServers"]:
                if server in captured:
                    capture["mcpToolActions"][baseline_key(server)] = captured[server]
        except (OSError, json.JSONDecodeError) as capture_error:
            inconclusive.append("MCP capture 失敗: {}".format(capture_error))
    print(json.dumps(capture, indent=2, ensure_ascii=False))
    if inconclusive:
        for reason in inconclusive:
            log("[inconclusive] {}".format(reason))
        return EXIT_INCONCLUSIVE
    return EXIT_OK


def main():
    if not BASELINE:
        log("error: baseline JSON が必要です")
        return EXIT_INCONCLUSIVE
    try:
        baseline = load_json(BASELINE)
    except (OSError, json.JSONDecodeError) as error:
        log("error: baseline を読めません: {}".format(error))
        return EXIT_INCONCLUSIVE
    for key in ("ruleActions", "expectedRuleActions", "mcpServers", "mcpIntrospectAllowlist", "mcpToolActions"):
        if key not in baseline:
            log("error: baseline に {} がありません".format(key))
            return EXIT_INCONCLUSIVE
    if HOME_OVERRIDE and not prepare_isolated_home():
        return EXIT_INCONCLUSIVE

    log("opencode action check")
    log("  baseline: {}".format(BASELINE))
    log("  workdir:  {}".format(WORKDIR))
    log("  opencode: {}".format(OPENCODE or "(not found)"))
    if ISOLATED_HOME:
        log("  isolated HOME: {}".format(ISOLATED_HOME))

    agents, source, error = collect_agents()

    if CAPTURE:
        return run_capture_mode(agents, source, error, baseline)

    observed, rule_additions, rule_removals = check_rules(agents, baseline) if agents else (set(), [], [])
    print_rule_section(observed, rule_additions, rule_removals, source, error)

    inconclusive = []
    mcp_results = []
    mcp_additions = []
    mcp_removals = []
    mcp_renames = []
    if SKIP_INTROSPECTION:
        mcp_results = [(server, "SKIPPED", 0, "") for server in baseline["mcpServers"]]
        inconclusive.append("--skip-introspection のため CHECK B 未実行")
    else:
        try:
            mcp_results, _, mcp_inconclusive, mcp_additions, mcp_removals, mcp_renames = resolve_server_tools(baseline)
            inconclusive.extend(mcp_inconclusive)
        except (OSError, json.JSONDecodeError) as mcp_error:
            inconclusive.append("CHECK B 実行不可: {}".format(mcp_error))
    print_mcp_section(mcp_results, mcp_additions, mcp_removals, mcp_renames)

    health_check(baseline)

    if error:
        inconclusive.append("CHECK A 実行不可: {}".format(error))
    drift_count = (
        len(rule_additions) + len(rule_removals) + len(mcp_additions) + len(mcp_removals) + len(mcp_renames)
    )
    log("")
    if inconclusive:
        for reason in inconclusive:
            log("[inconclusive] {}".format(reason))
        log(
            "[summary] 判定保留 (exit 2): drift候補={} inconclusive={} / CHECK A actions={} / CHECK B servers={}".format(
                drift_count, len(inconclusive), len(observed), len(mcp_results)
            )
        )
        return EXIT_INCONCLUSIVE
    if drift_count:
        print_fix_block()
        log("")
        log(
            "[summary] DRIFT (exit 1): 追加={} 削除={} action変更={} (rule 追加={} 削除={} / MCP 追加={} 削除={})".format(
                len(mcp_additions) + len(rule_additions),
                len(mcp_removals) + len(rule_removals),
                len(mcp_renames),
                len(rule_additions),
                len(rule_removals),
                len(mcp_additions),
                len(mcp_removals),
            )
        )
        return EXIT_DRIFT
    log(
        "[summary] OK (exit 0): CHECK A actions={} / CHECK B servers={} / drift=0".format(
            len(observed), len(mcp_results)
        )
    )
    return EXIT_OK


if __name__ == "__main__":
    try:
        with open(BASELINE, "r", encoding="utf-8") as _handle:
            EXPECTED_SERVERS.update(json.load(_handle).get("mcpServers", []))
    except (OSError, json.JSONDecodeError):
        pass
    sys.exit(main())
PY
