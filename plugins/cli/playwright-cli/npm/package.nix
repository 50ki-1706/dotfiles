{
  lib,
  stdenvNoCC,
  fetchurl,
  nodejs,
}:
let
  # Version must move in lockstep with the vendored skill skills/playwright-cli.
  # Bump procedure: update the three URLs (playwright/playwright-core versions
  # come from the chosen @playwright/cli version's registry metadata) and hashes.
  cli = fetchurl {
    url = "https://registry.npmjs.org/@playwright/cli/-/cli-0.1.21.tgz";
    hash = "sha256-RtC2YGHdSoTCh+NpZf0/GoxqScvPOz+Q+EICODPVI0w=";
  };
  playwright = fetchurl {
    url = "https://registry.npmjs.org/playwright/-/playwright-1.64.0-alpha-1789764292000.tgz";
    hash = "sha256-cEuOgeJVYvpQA4CDiU6DqLrcpB8Q1EIbNKDDlrO1MgE=";
  };
  playwright-core = fetchurl {
    url = "https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.0-alpha-1789764292000.tgz";
    hash = "sha256-cT4ZCH+i7AXusMYDQddIil5BYBSf4PogZSwhBia0YWE=";
  };
in
stdenvNoCC.mkDerivation {
  pname = "playwright-cli";
  version = "0.1.21";

  dontUnpack = true;

  buildPhase = ''
    runHook preBuild
    mkdir -p build/cli build/playwright build/playwright-core
    tar xzf ${cli} --strip-components=1 -C build/cli
    tar xzf ${playwright} --strip-components=1 -C build/playwright
    tar xzf ${playwright-core} --strip-components=1 -C build/playwright-core
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/node_modules/@playwright
    cp -r build/cli $out/lib/node_modules/@playwright/cli
    cp -r build/playwright $out/lib/node_modules/playwright
    cp -r build/playwright-core $out/lib/node_modules/playwright-core
    mkdir -p $out/bin
    cat > $out/bin/playwright-cli <<EOF
    #!/bin/sh
    exec ${lib.getExe nodejs} $out/lib/node_modules/@playwright/cli/playwright-cli.js "\$@"
    EOF
    chmod +x $out/bin/playwright-cli
    runHook postInstall
  '';

  meta = {
    description = "Playwright agent CLI (npm @playwright/cli distribution)";
    homepage = "https://playwright.dev";
    license = lib.licenses.asl20;
    mainProgram = "playwright-cli";
    platforms = lib.platforms.darwin;
  };
}
