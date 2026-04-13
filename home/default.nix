{ ... }:
{
  imports = [
    ./packages.nix
    ./ssh.nix
  ];

  home.username = "koki";
  home.homeDirectory = "/Users/koki";
  home.stateVersion = "24.11";
}
