{
  config,
  lib,
  ...
}:
{
  imports = [ ../nixpkgs ];
  # 一時的な回避策: opendesign ゲートウェイの tool_calls index 衝突
  # (nexu-io/open-design#9369) と、それに続く MALFORMED_RESPONSE によるターン
  # 中断 (deepseek-ai/deepseek-harness#7581, #8976) を dsh 側で吸収する
  # プラグインを、指定したプロファイルへ入れる。
  #
  # クライアント非依存の修正であることに注意: 壊れるのは pi-ai アダプタの
  # tool_calls 組み立てなので、desktop / web / dsh-tui / headless のどれでも
  # 同じように起きる。dsh はハーネスでありクライアントではないため、
  # plugins/harness/ 配下の dsh 本体 plugin の子として置き、対象プロファイルを
  # 選択できるようにしている。
  #
  # 取り外し: plugins/harness/deepseek-harness/default.nix の import を外すか、
  # profiles を空にする。プロファイルの bundle 一覧からも shim が消え、stock の
  # アダプタが元のまま全 route を持つ。
  options.dshOpendesignToolcallShim = {
    profiles = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = ''
        shim を入れる dsh プロファイル名。存在しないプロファイル
        (Home Manager が組んでいない desktop / web など) はスキップする。
      '';
    };
    dshHome = lib.mkOption {
      type = lib.types.str;
      default = "$HOME/.dsh";
      description = "dsh のホームディレクトリ。";
    };
  };

  config = {
    home =
      { lib, pkgs, ... }:
      let
        shim = ./.;
        shimName = "dsh-opendesign-toolcall-shim";
        target = config.dshOpendesignToolcallShim;
        # プロファイルの bundle 一覧に shim を足す (冪等)。stock の
        # stock のアダプタ行より後に置くことで、shim の行が後勝ちで置き換える。
        addShimBundle = pkgs.writeText "add-opendesign-shim-bundle.py" ''
          import json, sys
          path = sys.argv[1]
          with open(path) as handle:
              manifest = json.load(handle)
          bundles = manifest.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
          if "${shimName}" not in bundles:
              bundles.append("${shimName}")
          with open(path, "w") as handle:
              json.dump(manifest, handle, indent=2)
              handle.write("\n")
        '';
      in
      lib.mkIf (target.profiles != [ ]) {
        home.activation.installOpendesignToolcallShim = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
          for profile in ${lib.escapeShellArgs target.profiles}; do
            SHIM_PROFILE="${target.dshHome}/profiles/$profile"
            SHIM_TARGET="$SHIM_PROFILE/node_modules/${shimName}"

            # Home Manager が組んでいないプロファイル (desktop / web など) は
            # 触らない: 手動管理の構成を壊さないため。
            if [ ! -f "$SHIM_PROFILE/package.json" ]; then
              echo "opendesign-toolcall-shim: profile '$profile' は存在しないためスキップします" >&2
              continue
            fi

            run mkdir -p "$SHIM_PROFILE/node_modules"
            run rm -rf "$SHIM_TARGET"
            run mkdir -p "$SHIM_TARGET"
            # nix store の内容は読み取り専用なので、コピー後に書き込み可能へ戻す。
            # 戻さないと次回の activation の rm -rf が失敗する。
            run cp -R ${shim}/. "$SHIM_TARGET/"
            run chmod -R u+w "$SHIM_TARGET"

            run ${pkgs.python3} ${addShimBundle} "$SHIM_PROFILE/package.json"
          done
        '';
      };
  };
}
