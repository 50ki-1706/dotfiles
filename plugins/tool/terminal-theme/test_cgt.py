"""State/config preservation tests; run with cgt's packaged Python."""

import contextlib
import io
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import cgt
import tomlkit
from ruamel.yaml import YAML
from ruamel.yaml.events import AliasEvent


class SwitchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.state = self.root / "state"
        self.state.mkdir()
        self.profiles = self.root / "profiles"
        for mode in ("light", "dark"):
            profile = self.profiles / mode
            profile.mkdir(parents=True)
            for name in ("ghostty", "herdr.toml", "helix.toml", "opencode.json"):
                (profile / name).write_text(mode)
            (profile / "lazygit.json").write_text(json.dumps({"defaultFgColor": [mode]}))
            (profile / "codex.tmTheme").write_bytes(Path(__file__).with_name("dark-modern.codex.tmTheme").read_bytes())
        self.vibe = self.root / "vibe" / "config.toml"
        self.vibe.parent.mkdir()
        self.vibe.write_text('# keep this comment\ntheme = "textual-dark"\nactive_model = "my-model"\n')
        self.vibe.chmod(0o600)
        self.lazy = self.root / "lazygit" / "config.yml"
        self.lazy.parent.mkdir()
        self.lazy.write_text("# keep yaml comment\ngui:\n  mouseEvents: false\n  darkTheme:\n    defaultFgColor: [red]\ngit:\n  autoFetch: false\n")
        self.claude = self.root / "claude" / "settings.json"
        self.claude.parent.mkdir()
        self.claude.write_text('{"theme": "dark", "permissions": {"allow": ["Read"]}, "model": "test-model"}\n')
        self.claude.chmod(0o640)
        self.codex = self.root / "codex" / "config.toml"
        self.codex.parent.mkdir()
        self.codex.write_text('# keep codex comment\nmodel = "test-model"\n[tui]\nnotifications = false\ntheme = "zenburn" # keep theme comment\n')
        self.codex.chmod(0o600)
        self.codex_theme = self.codex.parent / "themes/cgt-dark-modern.tmTheme"
        self.configs = [self.vibe, self.lazy, self.claude, self.codex]
        environment = patch.dict(os.environ, {
            "CLAUDE_CONFIG_DIR": str(self.claude.parent),
            "CODEX_HOME": str(self.codex.parent),
        })
        environment.start()
        self.addCleanup(environment.stop)

    def switch(self, mode):
        cgt.switch(self.profiles, self.state, mode, self.vibe, self.lazy, self.claude, self.codex)

    def assert_no_yaml_aliases_or_anchors(self):
        events = list(YAML().parse(self.lazy.read_text()))
        self.assertFalse(any(isinstance(event, AliasEvent) for event in events))
        self.assertFalse(any(getattr(event, "anchor", None) for event in events))

    def test_switches_emit_no_aliases_or_anchors(self):
        for mode in ("light", "dark", "dark", "light"):
            with self.subTest(mode=mode):
                self.switch(mode)
                self.assert_no_yaml_aliases_or_anchors()
                gui = YAML().load(self.lazy.read_text())["gui"]
                self.assertEqual(gui["theme"]["defaultFgColor"], [mode])
                self.assertEqual(gui[mode + "Theme"]["defaultFgColor"], [mode])

    def test_existing_aliases_expand_and_preserve_unrelated_settings(self):
        self.lazy.write_text(
            '# keep comment\nshared: &settings\n  label: "quoted value"\n'
            '  colors: &colors [red, blue]\ncopy: *settings\nmore: *colors\n'
            'gui:\n  mouseEvents: false\n'
        )
        self.switch("dark")
        self.assert_no_yaml_aliases_or_anchors()
        text = self.lazy.read_text()
        self.assertIn("# keep comment", text)
        self.assertIn('"quoted value"', text)
        document = YAML().load(text)
        self.assertEqual(document["shared"], document["copy"])
        self.assertEqual(document["more"], ["red", "blue"])
        self.assertFalse(document["gui"]["mouseEvents"])

    def test_round_trip_preserves_settings_comments_permissions_and_backups(self):
        originals = {path: path.read_bytes() for path in self.configs}
        for mode, theme in (("dark", "ansi-dark"), ("light", "solarized-light"), ("light", "solarized-light")):
            self.switch(mode)
            self.assertEqual((self.state / "current").resolve(), self.profiles / mode)
            document = tomlkit.loads(self.vibe.read_text())
            self.assertEqual(document["theme"], theme)
            self.assertEqual(document["active_model"], "my-model")
            self.assertIn("# keep this comment", self.vibe.read_text())
            self.assertIn("# keep yaml comment", self.lazy.read_text())
            lazy = YAML().load(self.lazy.read_text())
            self.assertFalse(lazy["gui"]["mouseEvents"])
            self.assertFalse(lazy["git"]["autoFetch"])
            self.assertEqual(lazy["gui"]["colorScheme"], mode)
            self.assertEqual(lazy["gui"][mode + "Theme"]["defaultFgColor"], [mode])
            self.assertEqual(self.vibe.stat().st_mode & 0o777, 0o600)
            claude = json.loads(self.claude.read_text())
            self.assertEqual(claude["theme"], mode + "-ansi")
            self.assertEqual(claude["permissions"], {"allow": ["Read"]})
            self.assertEqual(claude["model"], "test-model")
            self.assertEqual(self.claude.stat().st_mode & 0o777, 0o640)
            codex = tomlkit.loads(self.codex.read_text())
            self.assertEqual(codex["tui"]["theme"], "cgt-dark-modern" if mode == "dark" else "solarized-light")
            self.assertFalse(codex["tui"]["notifications"])
            self.assertEqual(codex["model"], "test-model")
            self.assertIn("# keep codex comment", self.codex.read_text())
            self.assertIn("# keep theme comment", self.codex.read_text())
            self.assertEqual(self.codex.stat().st_mode & 0o777, 0o600)
            theme = plistlib.loads(self.codex_theme.read_bytes())
            self.assertEqual(theme["name"], "cgt-dark-modern")
            self.assertEqual(theme["settings"][0]["settings"]["background"], "#1f1f1f")
        for path, original in originals.items():
            self.assertEqual(path.with_name(path.name + ".cgt-backup").read_bytes(), original)

    def test_malformed_second_config_does_not_partially_switch(self):
        self.switch("light")
        self.lazy.write_text("gui: [invalid")
        before = self.vibe.read_bytes()
        with self.assertRaises(Exception):
            self.switch("dark")
        self.assertEqual(self.vibe.read_bytes(), before)
        self.assertEqual((self.state / "current").resolve(), self.profiles / "light")

    def test_commit_failure_rolls_back_user_configs(self):
        self.switch("light")
        before = [path.read_bytes() for path in self.configs]
        with patch.object(cgt, "replace_link", side_effect=OSError("simulated failure")):
            with self.assertRaises(OSError):
                self.switch("dark")
        self.assertEqual([path.read_bytes() for path in self.configs], before)
        self.assertEqual((self.state / "current").resolve(), self.profiles / "light")

    def test_invalid_agent_config_aborts_before_any_write(self):
        self.switch("light")
        for path, invalid in ((self.claude, "[]"), (self.claude, "{invalid"), (self.codex, "[invalid"), (self.codex, 'tui = "invalid"')):
            with self.subTest(path=path.name, invalid=invalid):
                original = path.read_bytes()
                path.write_text(invalid)
                before = [config.read_bytes() for config in self.configs]
                with self.assertRaises(Exception):
                    self.switch("dark")
                self.assertEqual([config.read_bytes() for config in self.configs], before)
                self.assertEqual((self.state / "current").resolve(), self.profiles / "light")
                path.write_bytes(original)

    def test_missing_agent_configs_and_theme_are_removed_on_rollback(self):
        self.claude.unlink()
        self.codex.unlink()
        with patch.object(cgt, "replace_link", side_effect=OSError("failed")):
            with self.assertRaises(OSError):
                self.switch("dark")
        for path in (self.claude, self.codex, self.codex_theme):
            self.assertFalse(path.exists())
        self.switch("dark")
        self.assertEqual(json.loads(self.claude.read_text()), {"theme": "dark-ansi"})
        self.assertEqual(tomlkit.loads(self.codex.read_text())["tui"]["theme"], "cgt-dark-modern")

    def test_agent_config_symlinks_are_preserved_and_store_links_rejected(self):
        for path in (self.claude, self.codex):
            target = path.with_name("user-" + path.name)
            path.rename(target)
            path.symlink_to(target)
        self.switch("dark")
        self.assertTrue(self.claude.is_symlink())
        self.assertTrue(self.codex.is_symlink())
        before = self.claude.read_bytes()
        self.codex.unlink()
        self.codex.symlink_to("/nix/store/cgt-test-config/config.toml")
        with self.assertRaisesRegex(ValueError, "Nix-managed"):
            self.switch("light")
        self.assertEqual(self.claude.read_bytes(), before)
        self.assertEqual((self.state / "current").resolve(), self.profiles / "dark")

    def test_initialize_defaults_light_then_retains_dark_across_generations(self):
        argv = ["cgt", "--profiles", str(self.profiles), "--state-dir", str(self.state), "--initialize"]
        def initialize():
            with patch("sys.argv", argv), patch.dict(os.environ, {"VIBE_HOME": str(self.vibe.parent)}), patch.object(cgt.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()):
                run.return_value.stdout = str(self.lazy.parent)
                self.assertEqual(cgt.main(), 0)
                self.assertEqual(run.call_count, 1)  # No live UI reload during activation.
        initialize()
        self.assertEqual((self.state / "current").resolve(), self.profiles / "light")
        self.assertEqual(json.loads(self.claude.read_text())["theme"], "light-ansi")
        self.assertEqual(tomlkit.loads(self.codex.read_text())["tui"]["theme"], "solarized-light")
        self.switch("dark")
        old = self.profiles
        self.profiles = self.root / "new-profiles"
        old.rename(self.profiles)  # Old generation disappeared; selector is dangling.
        argv[2] = str(self.profiles)
        initialize()
        self.assertEqual((self.state / "current").resolve(), self.profiles / "dark")
        self.assertEqual(json.loads(self.claude.read_text())["theme"], "dark-ansi")
        self.assertEqual(tomlkit.loads(self.codex.read_text())["tui"]["theme"], "cgt-dark-modern")

    def test_missing_configs_and_user_symlinks(self):
        self.vibe.unlink()
        self.lazy.unlink()
        self.switch("light")
        target = self.root / "user-config.toml"
        self.vibe.rename(target)
        self.vibe.symlink_to(target)
        self.switch("dark")
        self.assertTrue(self.vibe.is_symlink())
        self.assertEqual(tomlkit.loads(target.read_text())["theme"], "ansi-dark")

    def test_command_reloads_only_after_the_new_theme_is_saved(self):
        argv = ["cgt", "--profiles", str(self.profiles), "--state-dir", str(self.state), "dark"]
        commands = []
        config_home = self.root / "config"
        cli = config_home / "opencode/cli.json"
        cli.parent.mkdir(parents=True)
        cli.symlink_to(self.state / "current/opencode.json")
        old_inode = cli.lstat().st_ino

        def run(command, **kwargs):
            commands.append(command[0])
            if command[0] == "lazygit":
                return subprocess.CompletedProcess(command, 0, str(self.lazy.parent))
            self.assertEqual((self.state / "current").resolve(), self.profiles / "dark")
            self.assertEqual(tomlkit.loads(self.vibe.read_text())["theme"], "ansi-dark")
            return subprocess.CompletedProcess(command, 0, "reloaded\n")

        with patch("sys.argv", argv), patch.dict(os.environ, {"VIBE_HOME": str(self.vibe.parent), "XDG_CONFIG_HOME": str(config_home)}), patch.object(cgt.subprocess, "run", side_effect=run), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cgt.main(), 0)
            self.assertIn("Ghostty: configuration reloaded.", output.getvalue())
            self.assertIn("OpenCode: configuration change notified", output.getvalue())
            self.assertIn("/config theme=dark-ansi", output.getvalue())
            self.assertIn("/theme and select cgt-dark-modern", output.getvalue())
        self.assertNotEqual(cli.lstat().st_ino, old_inode)
        self.assertEqual(cli.read_text(), "dark")
        self.assertEqual(commands, ["lazygit", "/usr/bin/osascript", "herdr", "/usr/bin/pkill"])

    def test_opencode_notification_preserves_the_home_manager_link_chain(self):
        self.switch("light")
        managed = self.root / "home-manager-link"
        managed.symlink_to(self.state / "current/opencode.json")
        cli = self.root / "cli.json"
        cli.symlink_to("home-manager-link")
        for mode in ("dark", "light"):
            self.switch(mode)
            cgt.reload_opencode(cli, self.state)
            self.assertEqual(os.readlink(cli), "home-manager-link")
            self.assertEqual(os.readlink(managed), str(self.state / "current/opencode.json"))
            self.assertEqual(cli.read_text(), mode)
            self.assertEqual(list(self.root.glob(".cgt-*")), [])

    def test_opencode_notification_leaves_unrelated_configs_alone(self):
        self.switch("dark")
        cli = self.root / "cli.json"
        for kind in ("missing", "regular", "symlink"):
            with self.subTest(kind=kind):
                if kind == "regular":
                    cli.write_text("custom")
                elif kind == "symlink":
                    cli.unlink()
                    cli.symlink_to("missing-custom-config")
                with contextlib.redirect_stdout(io.StringIO()) as output:
                    cgt.reload_opencode(cli, self.state)
                self.assertIn("reopen the TUI", output.getvalue())
                if kind == "regular":
                    self.assertEqual(cli.read_text(), "custom")
                elif kind == "symlink":
                    self.assertEqual(os.readlink(cli), "missing-custom-config")
                else:
                    self.assertFalse(cli.exists())

    def test_opencode_notification_failure_preserves_saved_theme_and_link(self):
        self.switch("dark")
        cli = self.root / "cli.json"
        cli.symlink_to(self.state / "current/opencode.json")
        with patch.object(cgt.os, "replace", side_effect=PermissionError("denied")), contextlib.redirect_stdout(io.StringIO()) as output:
            cgt.reload_opencode(cli, self.state)
        self.assertIn("reopen the TUI", output.getvalue())
        self.assertEqual(cli.read_text(), "dark")
        self.assertEqual(list(self.root.glob(".cgt-*")), [])


class ReloadTests(unittest.TestCase):
    def test_helix_notification_scopes_signal_and_handles_absent_processes(self):
        for status in (0, 1, 2):
            with self.subTest(status=status), patch.object(cgt.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
                run.return_value.returncode = status
                cgt.reload_helix()
                self.assertEqual(run.call_args.args[0], ["/usr/bin/pkill", "-USR1", "-u", str(os.getuid()), "-x", r"hx|\.hx-wrapped_?"])
                self.assertEqual("reload requested" in output.getvalue(), status == 0)
                self.assertEqual(":config-reload" in output.getvalue(), status == 2)

    def test_helix_notification_failure_explains_fallback(self):
        for error in (OSError("unavailable"), subprocess.TimeoutExpired("pkill", 5)):
            with self.subTest(error=type(error).__name__), patch.object(cgt.subprocess, "run", side_effect=error), contextlib.redirect_stdout(io.StringIO()) as output:
                cgt.reload_helix()
                self.assertIn(":config-reload", output.getvalue())

    def test_reload_success_or_no_running_terminal(self):
        for status in ("reloaded", "not-running", "no-terminals"):
            with self.subTest(status=status), patch.object(cgt.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
                run.return_value.stdout = status + "\n"
                cgt.reload_ghostty()
                self.assertNotIn("failed", output.getvalue())
                self.assertEqual("configuration reloaded" in output.getvalue(), status == "reloaded")

    def test_reload_failure_explains_manual_fallback(self):
        errors = [
            OSError("osascript unavailable"),
            subprocess.CalledProcessError(1, "osascript"),
            subprocess.TimeoutExpired("osascript", 30),
        ]
        for error in errors:
            with self.subTest(error=type(error).__name__), patch.object(cgt.subprocess, "run", side_effect=error), contextlib.redirect_stdout(io.StringIO()) as output:
                cgt.reload_ghostty()
                self.assertIn("Cmd+Shift+,", output.getvalue())
                self.assertIn("saved theme", output.getvalue())


if __name__ == "__main__":
    unittest.main()
