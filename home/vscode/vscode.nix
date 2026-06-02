{ lib, config, pkgs, ... }:
{
  imports = [
    ./extensions.nix
    ./keybindings.nix
    ./settings.nix
  ];

  home.activation.backupVscodeExtensionsDir = lib.hm.dag.entryBefore [ "checkLinkTargets" ] ''
    if [ -d "$HOME/.vscode/extensions" ] && [ ! -L "$HOME/.vscode/extensions" ]; then
      backup="$HOME/.vscode/extensions.$(date +%Y%m%d%H%M%S).backup"
      mv "$HOME/.vscode/extensions" "$backup"
    fi
  '';

  home.file.".vscode/extensions".force = true;

  programs.vscode = {
    enable = true;
    package = pkgs.vscode;
    mutableExtensionsDir = false;
  };

  # Intent: デフォルトプロファイルの設定・キーバインドを全プロファイルに共有する
  programs.vscode.profiles = {
    web.userSettings = config.programs.vscode.profiles.default.userSettings;
    web.keybindings = config.programs.vscode.profiles.default.keybindings;
    unity.userSettings = config.programs.vscode.profiles.default.userSettings;
    unity.keybindings = config.programs.vscode.profiles.default.keybindings;
    java.userSettings = config.programs.vscode.profiles.default.userSettings;
    java.keybindings = config.programs.vscode.profiles.default.keybindings;
    cpp.userSettings = config.programs.vscode.profiles.default.userSettings;
    cpp.keybindings = config.programs.vscode.profiles.default.keybindings;
    python.userSettings = config.programs.vscode.profiles.default.userSettings;
    python.keybindings = config.programs.vscode.profiles.default.keybindings;
  };
}
