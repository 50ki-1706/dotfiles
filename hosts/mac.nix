{ ollamaPkgs, ... }:
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
    extraSpecialArgs = { inherit ollamaPkgs; };
    users.koki = import ../home.nix;
  };

  homebrew = {
    enable = true;
    onActivation = {
      cleanup = "none";
      upgrade = false;
      autoUpdate = false;
    };

    taps = [
      {
        name = "koki/hanon-player";
        clone_target = "file:///Users/koki/Dev/mywork/eigo-no-hanon/homebrew-tap";
        trusted = true;
      }
      {
        name = "stablyai/orca";
        trusted = true;
      }
    ];

    brews = [
      "mas"
      "vim"
    ];

    casks = [
      "android-studio"
      "audacity"
      "bambu-studio"
      "bitwarden"
      "bruno"
      "claude"
      "codex"
      "codex-app"
      "cursor"
      "discord"
      "docker-desktop"
      "figma"
      "gimp"
      "google-chrome"
      "google-drive"
      "grok-bot"
      "handy"
      "koki/hanon-player/hanon-player"
      "notion"
      "obsidian"
      "onlyoffice"
      "openscad@snapshot"
      "stablyai/orca/orca"
      "raycast"
      "spotify"
      "steam"
      "unity"
      "unity-hub"
      "visual-studio-code"
      "vivaldi"
      "zoom"
    ];

    masApps = {
      GarageBand = 682658836;
      iMovie = 408981434;
      Keynote = 409183694;
      LINE = 539883307;
      Numbers = 409203825;
      Pages = 409201541;
    };

    vscode = [
      "esbenp.prettier-vscode"
      "github.vscode-github-actions"
      "github.vscode-pull-request-github"
      "jetpack-io.devbox"
      "jnoortheen.nix-ide"
      "mechatroner.rainbow-csv"
      "ms-ceintl.vscode-language-pack-ja"
      "ms-vscode-remote.remote-containers"
      "ms-vscode.live-server"
      "pkief.material-icon-theme"
      "simonsiefke.svg-preview"
      "sst-dev.opencode"
      "streetsidesoftware.code-spell-checker"
      "tamasfe.even-better-toml"
      "tomoki1207.pdf"
      "yzane.markdown-pdf"
    ];
  };
}
