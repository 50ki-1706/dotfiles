"""Switch the global terminal palette without editing the dotfiles checkout."""

import argparse
import fcntl
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import tomlkit
from ruamel.yaml import YAML


GHOSTTY_RELOAD_SCRIPT = '''
if application id "com.mitchellh.ghostty" is not running then return "not-running"
tell application id "com.mitchellh.ghostty"
    if (count of terminals) is 0 then return "no-terminals"
    set didReload to perform action "reload_config" on first terminal
    if not didReload then error "Ghostty declined reload_config"
end tell
return "reloaded"
'''


def reload_ghostty():
    # reload_config is app-wide. One surface is enough, including when the
    # calling shell is inside Herdr. Do not launch, focus, or quit the app.
    try:
        result = subprocess.run(
            ["/usr/bin/osascript", "-e", GHOSTTY_RELOAD_SCRIPT],
            check=True, capture_output=True, text=True, timeout=30,
        )
        if result.stdout.strip() == "reloaded":
            print("Ghostty: configuration reloaded.")
        elif result.stdout.strip() not in ("not-running", "no-terminals"):
            raise ValueError("unexpected Ghostty reload result")
    except (OSError, subprocess.SubprocessError, ValueError):
        print("Ghostty: automatic reload failed; press Cmd+Shift+, to apply the saved theme.")


def atomic_write(path, content, permissions=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".cgt-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            os.fchmod(stream.fileno(), permissions)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def replace_link(path, target):
    # The caller holds the state directory lock.
    temporary = path.with_name(".current-next")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, path)


def prepare_config(path, transform):
    # Preserve user-managed symlinks and file permissions. Never try to write
    # through a Nix store link: that requires fixing the declarative owner.
    target = path.resolve()
    if target.is_relative_to("/nix/store"):
        raise ValueError(f"{path} is Nix-managed; remove its competing declaration first")
    before = target.read_bytes() if target.exists() else None
    permissions = target.stat().st_mode & 0o777 if before is not None else 0o600
    after = transform((before or b"").decode()).encode()
    return target, before, after, permissions


def switch(profiles, state, mode, vibe_config, lazygit_config):
    profile = profiles / mode
    for name in ("ghostty", "herdr.toml", "helix.toml", "opencode.json", "lazygit.json"):
        if not (profile / name).is_file():
            raise ValueError(f"incomplete theme profile: {profile / name}")

    def vibe_theme(text):
        document = tomlkit.parse(text)
        # Vibe 3.1's Rust UI has no file-based custom themes. ansi-dark uses
        # Ghostty's Dark Modern colors; solarized-light is a built-in palette.
        document["theme"] = "ansi-dark" if mode == "dark" else "solarized-light"
        return tomlkit.dumps(document)

    def lazygit_theme(text):
        yaml = YAML()
        yaml.preserve_quotes = True
        document = yaml.load(text) or {}
        gui = document.setdefault("gui", {})
        gui["colorScheme"] = mode
        colors = json.loads((profile / "lazygit.json").read_text())
        gui.setdefault("theme", {}).update(colors)
        # Appearance-specific overrides take precedence over gui.theme.
        gui.setdefault(mode + "Theme", {}).update(colors)
        output = io.StringIO()
        yaml.dump(document, output)
        return output.getvalue()

    # Parse both existing configs before making any changes. Keep unrelated
    # settings and comments, including Vibe's model/auth configuration.
    changes = [
        prepare_config(vibe_config, vibe_theme),
        prepare_config(lazygit_config, lazygit_theme),
    ]
    current = state / "current"
    if current.exists() and not current.is_symlink():
        raise ValueError(f"expected a symlink: {current}")
    applied = []
    try:
        for path, before, after, permissions in changes:
            if before == after:
                continue
            backup = path.with_name(path.name + ".cgt-backup")
            if before is not None and not backup.exists():
                atomic_write(backup, before, permissions)
            atomic_write(path, after, permissions)
            applied.append((path, before, permissions))
        replace_link(current, profile)
    except Exception:
        for path, before, permissions in reversed(applied):
            if before is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, before, permissions)
        raise


def main():
    parser = argparse.ArgumentParser(description="Switch all terminal tools to Solarized Light or VS Code Dark Modern")
    parser.add_argument("mode", nargs="?", choices=("light", "dark"))
    parser.add_argument("--initialize", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--profiles", type=Path, required=True, help=argparse.SUPPRESS)
    parser.add_argument("--state-dir", type=Path, required=True, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if (args.mode is None) == (not args.initialize):
        parser.error("use cgt light or cgt dark")

    try:
        args.state_dir.mkdir(parents=True, exist_ok=True)
        with (args.state_dir / ".lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            mode = args.mode
            if args.initialize:
                current = args.state_dir / "current"
                mode = Path(os.readlink(current)).name if current.is_symlink() else "light"
                if mode not in ("light", "dark"):
                    raise ValueError(f"unknown persisted theme: {mode}")
            vibe = Path(os.environ.get("VIBE_HOME", Path.home() / ".vibe")) / "config.toml"
            # On macOS the native default is Library/Application Support/lazygit,
            # unless XDG_CONFIG_HOME is set. Ask the installed binary.
            lazygit = subprocess.run(
                ["lazygit", "--print-config-dir"], check=True, capture_output=True, text=True, timeout=5
            ).stdout.strip()
            if not lazygit:
                raise ValueError("lazygit returned an empty config directory")
            switch(args.profiles, args.state_dir, mode, vibe, Path(lazygit) / "config.yml")
    except Exception as error:
        print(f"cgt: {error}", file=sys.stderr)
        return 1

    print(f"cgt: {mode} ({'Solarized Light' if mode == 'light' else 'VS Code Dark Modern'})")
    if not args.initialize:
        reload_ghostty()
        try:
            subprocess.run(["herdr", "server", "reload-config"], check=True, capture_output=True, timeout=5)
        except (OSError, subprocess.SubprocessError):
            print("Herdr: reload config (prefix + Shift+R) or reopen the client.")
        print("Helix: :config-reload.")
        print("Reopen lazygit, OpenCode and Vibe to load the selected theme.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
