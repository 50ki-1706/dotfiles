{ pkgs, ... }:
{
  programs.vscode.extensions =
    with pkgs.vscode-extensions;
    [
      bierner.markdown-mermaid
      github.copilot
      dbaeumer.vscode-eslint
      ecmel.vscode-html-css
      esbenp.prettier-vscode
      github.vscode-github-actions
      github.vscode-pull-request-github
      jnoortheen.nix-ide
      marp-team.marp-vscode
      mechatroner.rainbow-csv
      mikestead.dotenv
      mkhl.direnv
      ms-ceintl.vscode-language-pack-ja
      ms-toolsai.jupyter
      ms-toolsai.jupyter-keymap
      ms-toolsai.jupyter-renderers
      ms-toolsai.vscode-jupyter-cell-tags
      ms-toolsai.vscode-jupyter-slideshow
      ms-vscode-remote.remote-containers
      ms-vscode.live-server
      pkief.material-icon-theme
      streetsidesoftware.code-spell-checker
      tomoki1207.pdf
      vscodevim.vim
    ]
    ++ pkgs.vscode-utils.extensionsFromVscodeMarketplace [
      {
        publisher = "bpruitt-goddard";
        name = "mermaid-markdown-syntax-highlighting";
        version = "1.8.1";
        sha256 = "sha256-Vq0I4LaRajocbCDTdXKSTLCt647hBLYBTFF+RmWytCA=";
      }
      {
        publisher = "kisstkondoros";
        name = "vscode-gutter-preview";
        version = "0.32.2";
        sha256 = "sha256-JIr4UGuwy9Z5oH8D8elGMBGP8s40pYLCEZGmJAO5Ga0=";
      }
      {
        publisher = "pomdtr";
        name = "excalidraw-editor";
        version = "3.9.1";
        sha256 = "sha256-/LqC8GUBEDs+yGYCIX8RQtxDmWogTTiTiF/WJiCuEj4=";
      }
      {
        publisher = "ryosuke-asano";
        name = "iniad-ai-mop-vscode-chat";
        version = "0.5.1";
        sha256 = "sha256-Ks2C2MX9TFbHlumfD85rYGnUouSrGwwBMY1ZsM2QyXw=";
      }
      {
        publisher = "simonsiefke";
        name = "svg-preview";
        version = "2.8.3";
        sha256 = "sha256-hIVe1MmkyuHoDa56ZQUsSAGMlKWABoQ0FBOfgZZDbCw=";
      }
      {
        publisher = "yzane";
        name = "markdown-pdf";
        version = "2.1.0";
        sha256 = "sha256-3N4de2jgLbBlDGouFU7XoH4ElL9En9+2ZprMqoL03/E=";
      }
    ];
}
