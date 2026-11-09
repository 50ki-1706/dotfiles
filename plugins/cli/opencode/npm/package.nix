{
  lib,
  stdenvNoCC,
  fetchurl,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "opencode";
  version = "2.1.4";

  # Use the same native package as the official @opencode/cli installer.
  src = fetchurl {
    url = "https://registry.npmjs.org/@opencode/cli-darwin-arm64/-/cli-darwin-arm64-${finalAttrs.version}.tgz";
    hash = "sha256-2qL+BPJ4hQkNzK7tng1lFLyAp4ScywqdlFIbODhRv6U=";
  };

  sourceRoot = "package";
  dontBuild = true;
  # Preserve the upstream Mach-O signature.
  dontFixup = true;
  installPhase = ''
    runHook preInstall
    install -Dm755 bin/opencode "$out/bin/opencode"
    runHook postInstall
  '';

  meta = {
    description = "OpenCode v2 command line interface";
    homepage = "https://opencode.ai/v2/docs/";
    license = lib.licenses.mit;
    mainProgram = "opencode";
    platforms = [ "aarch64-darwin" ];
  };
})
