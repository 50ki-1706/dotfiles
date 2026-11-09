{
  darwin =
    { ... }:
    {
      homebrew.casks = [ "visual-studio-code" ];
      homebrew.vscode = [
        "esbenp.prettier-vscode"
        "github.vscode-github-actions"
        "github.vscode-pull-request-github"
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
