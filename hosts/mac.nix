{ ... }:
{
  system.primaryUser = "koki";
  system.stateVersion = 7;

  nix.enable = false;

  users.users.koki = {
    name = "koki";
    home = "/Users/koki";
  };

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = false;
  };

  homebrew = {
    enable = true;
    onActivation = {
      cleanup = "none";
      upgrade = false;
      autoUpdate = false;
    };
  };
}
