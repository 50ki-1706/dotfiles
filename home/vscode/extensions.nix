{ pkgs, ... }:
let
  # 全プロファイル共通の拡張機能
  commonExtensions = with pkgs.vscode-extensions; [
    bierner.markdown-mermaid
    esbenp.prettier-vscode
    github.copilot
    github.vscode-github-actions
    github.vscode-pull-request-github
    jnoortheen.nix-ide
    marp-team.marp-vscode
    mechatroner.rainbow-csv
    mikestead.dotenv
    mkhl.direnv
    ms-ceintl.vscode-language-pack-ja
    ms-vscode-remote.remote-containers
    ms-vscode.live-server
    pkief.material-icon-theme
    streetsidesoftware.code-spell-checker
    tomoki1207.pdf
    vscodevim.vim
  ] ++ pkgs.vscode-utils.extensionsFromVscodeMarketplace [
    {
      publisher = "bpruitt-goddard";
      name = "mermaid-markdown-syntax-highlighting";
      version = "1.8.1";
      sha256 = "sha256-Vq0I4LaRajocbCDTdXKSTLCt647hBLYBTFF+RmWytCA=";
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

  webExtensions = with pkgs.vscode-extensions; [
    ecmel.vscode-html-css
    dbaeumer.vscode-eslint
  ] ++ pkgs.vscode-utils.extensionsFromVscodeMarketplace [
    {
      publisher = "yoavbls";
      name = "pretty-ts-errors";
      version = "0.3.0";
      sha256 = "sha256-AqtFqq54hSqfxgKpfWZ5dQY1RoGUzTxRPYKqX/Z28LM=";
    }
    {
      publisher = "CelianRiboulet";
      name = "webvalidator";
      version = "1.0.5";
      sha256 = "sha256-vNiXtu2lXPcJ2G03dcVy0NOL5Z0ohHLNrv8SYLGODeo=";
    }
  ];

  unityExtensions = with pkgs.vscode-extensions; [
    ms-dotnettools.csharp
    ms-dotnettools.csdevkit
  ] ++ pkgs.vscode-utils.extensionsFromVscodeMarketplace [
    {
      publisher = "ms-dotnettools";
      name = "vscode-dotnet-runtime";
      version = "2.2.6";
      sha256 = "sha256-ROBcTPz5EBHOajMl10NnkT0apFhU0ua8IHMlKXqn6WE=";
    }
    {
      publisher = "VisualStudioToolsForUnity";
      name = "vstuc";
      version = "1.0.0";
      sha256 = "sha256-+xrFkTsmaXZge5HiiEgTuHsQr9v3jTuRZhrzv7ogY5M=";
    }
    {
      publisher = "kleber-swf";
      name = "unity-code-snippets";
      version = "2.2.2";
      sha256 = "sha256-7fajJ+KEf/D6le3W10xg7bkPtTgGmGwFtaaRly9fH2Q=";
    }
  ];

  javaExtensions = pkgs.vscode-utils.extensionsFromVscodeMarketplace [
    {
      publisher = "vscjava";
      name = "vscode-java-pack";
      version = "0.29.0";
      sha256 = "sha256-qusk1X3mgRdzb4MRBr9WyOViG9UGYFDIv3aQOSrMSVo=";
    }
  ];

  cppExtensions = with pkgs.vscode-extensions; [
    ms-vscode.cpptools
  ];

  pythonExtensions = with pkgs.vscode-extensions; [
    ms-python.python
    ms-python.debugpy
    ms-python.vscode-pylance
    ms-toolsai.jupyter
    ms-toolsai.jupyter-keymap
    ms-toolsai.jupyter-renderers
    ms-toolsai.vscode-jupyter-cell-tags
    ms-toolsai.vscode-jupyter-slideshow
  ];
in {
  programs.vscode.profiles = {
    default.extensions = commonExtensions;
    web.extensions = commonExtensions ++ webExtensions;
    unity.extensions = commonExtensions ++ unityExtensions;
    java.extensions = commonExtensions ++ javaExtensions;
    cpp.extensions = commonExtensions ++ cppExtensions;
    python.extensions = commonExtensions ++ pythonExtensions;
  };
}
