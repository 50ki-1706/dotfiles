{
  lib,
  writeShellApplication,
  nodejs_24,
}:
# `dst` は dsh-TUI の起動器。パッケージの bin は dsh-tui と dst の両方に
# 同じ入口（bin/dsh-tui.js）を割り当てているので、profile 側の実体を
# そのまま起動すればよい。profile 内の入口から起動すると起動器は realpath
# 判定で profile ロールになり、`dsh --profile dsh-tui` を実行する。
# node は nixpkgs の dsh と同じ nodejs_24 に固定する。
writeShellApplication {
  name = "dst";
  runtimeInputs = [ nodejs_24 ];
  text = ''
    profile="''${DSH_HOME:-$HOME/.dsh}/profiles/dsh-tui"
    entry="$profile/node_modules/@deepseek-harness-tui/dsh-tui/bin/dsh-tui.js"

    if [ ! -f "$entry" ]; then
      echo "dst: dsh-TUI が未導入です ($entry)" >&2
      echo "dst: Home Manager を適用すると ~/.dsh/profiles/dsh-tui に展開されます" >&2
      exit 1
    fi

    exec node "$entry" "$@"
  '';
  meta = {
    description = "Launcher for the dsh-TUI profile";
    homepage = "https://github.com/ccch1mneyyy/dsh-TUI";
    license = lib.licenses.mit;
    mainProgram = "dst";
    platforms = lib.platforms.darwin;
  };
}
