"""State/config preservation tests; run with cgt's packaged Python."""

import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cgt
import tomlkit
from ruamel.yaml import YAML


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
        self.vibe = self.root / "vibe" / "config.toml"
        self.vibe.parent.mkdir()
        self.vibe.write_text('# keep this comment\ntheme = "textual-dark"\nactive_model = "my-model"\n')
        self.vibe.chmod(0o600)
        self.lazy = self.root / "lazygit" / "config.yml"
        self.lazy.parent.mkdir()
        self.lazy.write_text("# keep yaml comment\ngui:\n  mouseEvents: false\n  darkTheme:\n    defaultFgColor: [red]\ngit:\n  autoFetch: false\n")

    def switch(self, mode):
        cgt.switch(self.profiles, self.state, mode, self.vibe, self.lazy)

    def test_round_trip_preserves_settings_comments_permissions_and_backups(self):
        original = self.vibe.read_bytes()
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
        self.assertEqual(self.vibe.with_suffix(".toml.cgt-backup").read_bytes(), original)

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
        before = [self.vibe.read_bytes(), self.lazy.read_bytes()]
        with patch.object(cgt, "replace_link", side_effect=OSError("simulated failure")):
            with self.assertRaises(OSError):
                self.switch("dark")
        self.assertEqual([self.vibe.read_bytes(), self.lazy.read_bytes()], before)
        self.assertEqual((self.state / "current").resolve(), self.profiles / "light")

    def test_initialize_defaults_light_then_retains_dark_across_generations(self):
        argv = ["cgt", "--profiles", str(self.profiles), "--state-dir", str(self.state), "--initialize"]
        def initialize():
            with patch("sys.argv", argv), patch.dict(os.environ, {"VIBE_HOME": str(self.vibe.parent)}), patch.object(cgt.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()):
                run.return_value.stdout = str(self.lazy.parent)
                self.assertEqual(cgt.main(), 0)
                self.assertEqual(run.call_count, 1)  # No live UI reload during activation.
        initialize()
        self.assertEqual((self.state / "current").resolve(), self.profiles / "light")
        self.switch("dark")
        old = self.profiles
        self.profiles = self.root / "new-profiles"
        old.rename(self.profiles)  # Old generation disappeared; selector is dangling.
        argv[2] = str(self.profiles)
        initialize()
        self.assertEqual((self.state / "current").resolve(), self.profiles / "dark")

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


if __name__ == "__main__":
    unittest.main()
