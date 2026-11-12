{
  config,
  inputs,
  lib,
  ...
}:
{
  imports = [ ../nixpkgs ];
  # `/publish` と publish ツール群を、指定した dsh プロファイルへ入れる。
  #
  # 中身は harness 非依存の publish コア (src/) と、dsh の
  # tools / commands / skills / approval に繋ぐアダプタ (src/dsh/) です。
  # コアは harness を知らないので、他の harness は同じ PublishHost を
  # 実装すれば同じコアを再利用できます。
  #
  # dsh はハーネスでありクライアントではないため、plugins/harness/ 配下の
  # dsh 本体 plugin の子として置き、対象プロファイルを選べるようにしています。
  options.dshPublish = {
    profiles = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = ''
        publish plugin を入れる dsh プロファイル名。存在しないプロファイル
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
        # pr スキルの取得元。opencode plugin と同じ pin を使う。
        prSource = pkgs.fetchFromGitHub {
          owner = "mattpocock";
          repo = "skills";
          rev = "4ae2317ddb22b046e26455e4f9c9b3aaaf62212d";
          hash = "sha256-3vhd77xfZjKUYJsIwPFevIZPUAzUgZXr0RYj5NQrBwk=";
        };
        # プラグイン本体 (dist / package.json / patch / instructions) と、
        # 同梱スキル (git-surgeon / pr) を組み立てる。この default.nix は
        # 配布物ではない。
        #
        # dist/ はコミット済みのコンパイル結果。dsh はプロファイル plugin を
        # node_modules 配下から読み込み、そこでは Node が型を剥がさないため。
        # git-surgeon の skill は overlay の有無に依らず同じ flake input から取る。
        # 合成テストは overlay なしで home を評価するため。
        gitSurgeon = inputs.git-surgeon.packages.${pkgs.stdenv.hostPlatform.system}.default;
        plugin = pkgs.runCommand "dsh-publish-bundle" { } ''
          mkdir -p "$out"
          cp -R ${../../publish/dist} "$out/dist"
          cp ${../../publish/package.json} "$out/package.json"
          cp ${../../publish/cordis.patch.yml} "$out/cordis.patch.yml"
          cp ${../../publish/instructions.md} "$out/instructions.md"
          cp ${gitSurgeon.src}/skills/git-surgeon/SKILL.md "$out/official-skill.md"
          cp ${prSource}/skills/engineering/pr/SKILL.md "$out/pr-skill.md"
        '';
        pluginName = "dsh-publish";
        target = config.dshPublish;
        # プロファイルの bundle 一覧に plugin を足す (冪等)。
        addBundle = pkgs.writeText "add-dsh-publish-bundle.py" ''
          import json, sys
          path = sys.argv[1]
          with open(path) as handle:
              manifest = json.load(handle)
          bundles = manifest.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
          if "${pluginName}" not in bundles:
              bundles.append("${pluginName}")
          with open(path, "w") as handle:
              json.dump(manifest, handle, indent=2)
              handle.write("\n")
        '';
      in
      lib.mkIf (target.profiles != [ ]) {
        home.activation.installDshPublish = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
          for profile in ${lib.escapeShellArgs target.profiles}; do
            PUBLISH_PROFILE="${target.dshHome}/profiles/$profile"
            PUBLISH_TARGET="$PUBLISH_PROFILE/node_modules/${pluginName}"

            # Home Manager が組んでいないプロファイル (desktop / web など) は
            # 触らない: 手動管理の構成を壊さないため。
            if [ ! -f "$PUBLISH_PROFILE/package.json" ]; then
              echo "dsh-publish: profile '$profile' は存在しないためスキップします" >&2
              continue
            fi

            run mkdir -p "$PUBLISH_PROFILE/node_modules"
            run rm -rf "$PUBLISH_TARGET"
            run mkdir -p "$PUBLISH_TARGET"
            # nix store の内容は読み取り専用なので、コピー後に書き込み可能へ戻す。
            # 戻さないと次回の activation の rm -rf が失敗する。
            run cp -R ${plugin}/. "$PUBLISH_TARGET/"
            run chmod -R u+w "$PUBLISH_TARGET"

            run ${pkgs.python3} ${addBundle} "$PUBLISH_PROFILE/package.json"
          done
        '';
      };
  };
}
