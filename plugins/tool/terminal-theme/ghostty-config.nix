{ dark }:
"command = direct:/Users/koki/.nix-profile/bin/herdr --session ghostty\n"
+
  builtins.replaceStrings
    [ "theme = iTerm2 Solarized Light" ]
    [ (if dark then "theme = ${./dark-modern.ghostty}" else "theme = iTerm2 Solarized Light") ]
    (builtins.readFile ../../app/ghostty/config)
