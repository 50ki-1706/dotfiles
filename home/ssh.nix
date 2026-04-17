{ lib, pkgs, ... }:
let
  mkGitHubBlock = identityFile: {
    hostname = "github.com";
    user = "git";
    inherit identityFile;
    identitiesOnly = true;
    extraOptions = {
      AddKeysToAgent = "yes";
    }
    // lib.optionalAttrs pkgs.stdenv.isDarwin {
      UseKeychain = "yes";
    };
  };
in
{
  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;
    matchBlocks = {
      "github.com" = mkGitHubBlock "~/.ssh/id_ed25519";
    };
  };
}
