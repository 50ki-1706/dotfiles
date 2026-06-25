{
  lib,
  isDarwin ? false,
  ...
}:
{
  imports = lib.optionals isDarwin [ ./darwin.nix ];
}
