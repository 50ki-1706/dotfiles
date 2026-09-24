{ lib, pkgs, ... }:
let
  mkGitHubBlock =
    identityFile:
    {
      HostName = "github.com";
      User = "git";
      IdentityFile = identityFile;
      IdentitiesOnly = true;
      AddKeysToAgent = "yes";
    }
    // lib.optionalAttrs pkgs.stdenv.isDarwin {
      UseKeychain = "yes";
    };
in
{
  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;
    settings = {
      "github.com" = mkGitHubBlock "~/.ssh/id_ed25519";
    };
  };
}
