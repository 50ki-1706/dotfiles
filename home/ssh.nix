{ lib, pkgs, ... }:
let
  extraAccounts = {
    # 例: work = "~/.ssh/id_ed25519_work";
  };

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

    extraConfig = ''
      Include ~/.ssh/config.d/accounts
    '';

    matchBlocks = {
      "*" = {};
      "github.com" = mkGitHubBlock "~/.ssh/id_ed25519";
    }
    // lib.mapAttrs' (
      name: identityFile: lib.nameValuePair "github.com-${name}" (mkGitHubBlock identityFile)
    ) extraAccounts;
  };
}
