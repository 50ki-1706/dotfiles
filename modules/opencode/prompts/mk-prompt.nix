paths: builtins.concatStringsSep "\n\n" (map builtins.readFile paths)
