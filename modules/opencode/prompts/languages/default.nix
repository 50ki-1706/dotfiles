let
  language = filenames: extensions: prompt: {
    inherit filenames extensions;
    text = builtins.readFile prompt;
  };
in
{
  javascript =
    language
      [ "package.json" ]
      [
        ".js"
        ".jsx"
        ".mjs"
        ".cjs"
        ".ts"
        ".tsx"
        ".mts"
        ".cts"
        ".vue"
        ".svelte"
        ".astro"
      ]
      ./javascript.md;
  python =
    language [ "pyproject.toml" "setup.py" "setup.cfg" "requirements.txt" "Pipfile" ] [ ".py" ".pyi" ]
      ./python.md;
  go = language [ "go.mod" "go.work" ] [ ".go" ] ./go.md;
  rust = language [ "Cargo.toml" ] [ ".rs" ] ./rust.md;
}
