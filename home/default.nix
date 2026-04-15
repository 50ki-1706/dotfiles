{ ... }:
{
  imports = [
    ./packages.nix
    ./ssh.nix
  ];

  programs.git = {
    enable = true;

    signing = {
      format = "ssh";
    };

    settings = {
      core = {
        excludesFile = "~/.config/git/ignore";
      };
    };

    includes = [
      { path = "~/.config/git/accounts.include"; }
    ];
  };

  home.username = "koki";
  home.homeDirectory = "/Users/koki";
  home.stateVersion = "24.11";
}
