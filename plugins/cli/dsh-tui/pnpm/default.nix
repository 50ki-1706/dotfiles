{
  imports = [ ../../deepseek-harness ];
  home =
    { lib, pkgs, ... }:
    let
      dshTuiProfile = "$HOME/.dsh/profiles/dsh-tui";
    in
    {
      # dsh-TUI は dsh の profile プラグイン。profile の中身（package.json と
      # pnpm-lock.yaml）はこのリポジトリで宣言し、依存の取得だけを activation で
      # pnpm に任せる。nixpkgs の dsh は toolchain 製 Node 向けのパッチと
      # --expose-internals 付き起動器を既に持つため、プラグインは npm の通常
      # 配布物をそのまま使える。
      #
      # 注意: profile 配下のパッケージは実体である必要がある。symlink だと dsh の
      # loader が @deepseek-ai/* を供給できず ERR_MODULE_NOT_FOUND になる。
      # pnpm install は実体を展開するのでこの条件を満たす。
      home.activation.installDshTui = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
        DSH_TUI_PROFILE="${dshTuiProfile}"

        run mkdir -p "$DSH_TUI_PROFILE"
        run install -m644 ${./package.json} "$DSH_TUI_PROFILE/package.json"
        run install -m644 ${./pnpm-lock.yaml} "$DSH_TUI_PROFILE/pnpm-lock.yaml"
        run install -m644 ${./pnpm-workspace.yaml} "$DSH_TUI_PROFILE/pnpm-workspace.yaml"
        run install -m644 ${./cordis.yml} "$DSH_TUI_PROFILE/cordis.yml"
        # ユーザーが編集しうるので、無い場合だけ置く。
        if [ ! -e "$DSH_TUI_PROFILE/cordis.patch.yml" ]; then
          run install -m644 ${./cordis.patch.yml} "$DSH_TUI_PROFILE/cordis.patch.yml"
        fi

        if ! run ${lib.getExe pkgs.pnpm} install --dir "$DSH_TUI_PROFILE" --frozen-lockfile --ignore-scripts; then
          _iError "dsh-tui: pnpm install に失敗しました (%s)" "$DSH_TUI_PROFILE"
        fi
      '';

    };
}
