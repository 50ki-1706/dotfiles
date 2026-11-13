{
  lib,
  stdenvNoCC,
  nodejs_24,
}:
# The publish MCP server for Codex CLI.
#
# Codex starts this from ~/.codex/config.toml:
#
#   [mcp_servers.publish]
#   command = "/path/to/publish-mcp"
#
# The bundle carries the compiled adapter and the core it depends on, so the
# server runs without the workspace's node_modules.
stdenvNoCC.mkDerivation {
  pname = "publish-mcp";
  version = "0.1.0";

  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/publish-mcp/node_modules/@publish/core" "$out/bin"
    cp -R ${../../../harness/publish/codex-adapter/dist} "$out/lib/publish-mcp/dist"
    cp ${../../../harness/publish/codex-adapter/package.json} "$out/lib/publish-mcp/package.json"
    cp ${../../../harness/publish/codex-adapter/instructions.md} "$out/lib/publish-mcp/instructions.md"

    cp -R ${../../../harness/publish/core/dist} "$out/lib/publish-mcp/node_modules/@publish/core/dist"
    cp ${../../../harness/publish/core/package.json} "$out/lib/publish-mcp/node_modules/@publish/core/package.json"

    cat > "$out/bin/publish-mcp" <<EOF
    #!${lib.getExe nodejs_24}
    EOF
    printf 'import(%s)\n' "'$out/lib/publish-mcp/dist/main.js'" >> "$out/bin/publish-mcp"
    chmod +x "$out/bin/publish-mcp"
    runHook postInstall
  '';

  meta = {
    description = "Publish tools for Codex CLI as an MCP server over stdio";
    mainProgram = "publish-mcp";
    platforms = lib.platforms.darwin ++ lib.platforms.linux;
  };
}
