{
  home =
    { pkgs, ... }:
    {
      programs.helix = {
        enable = true;
        extraPackages = with pkgs; [
          vscode-langservers-extracted
          typescript-language-server
          tailwindcss-language-server
          elmPackages.elm-language-server
          gopls
          taplo
          nil
          pyright
        ];
      };
    };
}
