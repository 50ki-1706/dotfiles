{
  packages =
    pkgs:
    pkgs.lib.optionalAttrs (pkgs.stdenv.hostPlatform.system == "aarch64-darwin") {
      opencodeActionCheck = pkgs.callPackage ./package.nix {
        opencode = pkgs.callPackage ../../npm/package.nix { };
      };
    };
}
