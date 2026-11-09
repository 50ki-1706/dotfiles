{ lib, ... }:
let
  inherit (lib) mkOption types;
in
{
  options = {
    home = mkOption {
      type = types.deferredModule;
      default = { };
    };
    darwin = mkOption {
      type = types.deferredModule;
      default = { };
    };
    overlays = mkOption {
      type = types.listOf (types.functionTo (types.functionTo types.raw));
      default = [ ];
    };
    packages = mkOption {
      type = types.functionTo (types.attrsOf types.package);
      default = _: { };
    };
    apps = mkOption {
      type = types.functionTo (
        types.attrsOf (
          types.submodule {
            options = {
              type = mkOption {
                type = types.enum [ "app" ];
                default = "app";
              };
              program = mkOption { type = types.str; };
            };
          }
        )
      );
      default = _: { };
    };
  };
}
