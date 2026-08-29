{ pkgs, ollamaPkgs, ... }:
let
  # Upstream process-table probes fail in this Darwin build environment.
  worktrunk =
    if pkgs.stdenv.isDarwin then
      pkgs.worktrunk.overrideAttrs (old: {
        checkFlags = (old.checkFlags or [ ]) ++ [
          "--skip=shell::utils::tests::test_process_name_and_ppid_self"
          "--skip=shell::utils::tests::test_probe_reports_invoked_name_for_sh"
        ];
      })
    else
      pkgs.worktrunk;
in
{
  home.packages = [
    pkgs.fzf
    pkgs.git
    pkgs.lazygit
    worktrunk
    pkgs.bitwarden-cli
    pkgs.devbox
    pkgs.nixfmt
    pkgs.ripgrep
    pkgs.yazi
    pkgs.yq-go
    pkgs.zellij
    pkgs.claude-code
    pkgs.uv
    ollamaPkgs.ollama
  ];
}
