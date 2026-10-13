{
  writeShellApplication,
  writeText,
  python3,
  opencode,
}:
let
  baseline = writeText "opencode-actions-baseline.json" (
    builtins.toJSON (import ../modules/opencode/actions.nix).checkerBaseline
  );
in
writeShellApplication {
  name = "opencode-action-check";
  runtimeInputs = [
    python3
    opencode
  ];
  text = ''
    export OPENCODE_ACTION_BASELINE=${baseline}
    ${builtins.readFile ../scripts/check-opencode-actions.sh}
  '';
}
