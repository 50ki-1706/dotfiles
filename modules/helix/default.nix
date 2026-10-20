{ lib, pkgs, ... }:
let
  manualFormatLanguages = [
    "html"
    "css"
    "scss"
    "javascript"
    "jsx"
    "typescript"
    "tsx"
    "elm"
    "go"
    "gomod"
    "gowork"
    "python"
    "toml"
    "json"
    "jsonc"
    "json-ld"
    "nix"
  ];
  languageServerOverrides = {
    javascript = [
      "typescript-language-server"
      "tailwindcss-ls"
    ];
    jsx = [
      "typescript-language-server"
      "tailwindcss-ls"
    ];
    typescript = [
      "typescript-language-server"
      "tailwindcss-ls"
    ];
    tsx = [
      "typescript-language-server"
      "tailwindcss-ls"
    ];
    html = [
      "vscode-html-language-server"
      "tailwindcss-ls"
    ];
    css = [
      "vscode-css-language-server"
      "tailwindcss-ls"
    ];
    python = [ "pyright" ];
  };
in
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

    settings = {
      theme = "catppuccin_mocha";
      editor = {
        cursor-shape = {
          normal = "block";
          insert = "bar";
          select = "underline";
        };
        line-number = "relative";
        bufferline = "always";
        true-color = true;
        idle-timeout = 400;
        cursorline = true;
        scrolloff = 10;
      };
    };

    languages = {
      language = map (
        name:
        {
          inherit name;
          auto-format = false;
        }
        // lib.optionalAttrs (builtins.hasAttr name languageServerOverrides) {
          language-servers = languageServerOverrides.${name};
        }
      ) manualFormatLanguages;
    };
  };
}
