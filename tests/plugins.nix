{ inputs }:
let
  inherit (inputs.nixpkgs) lib;
  compose = modules: import ../lib/plugins.nix { inherit lib inputs modules; };
  pkgsFor =
    plugins:
    import inputs.nixpkgs {
      system = "aarch64-darwin";
      config.allowUnfree = true;
      inherit (plugins) overlays;
    };
  homeFor =
    plugins:
    (inputs.home-manager.lib.homeManagerConfiguration {
      pkgs = pkgsFor plugins;
      modules = [
        plugins.home
        {
          home.username = "test";
          home.homeDirectory = "/Users/test";
          home.stateVersion = "24.11";
        }
      ];
    }).config;
  succeeds = value: (builtins.tryEval (builtins.deepSeq value true)).success;
  empty = compose [ ];
  pkgs = pkgsFor empty;
  dsh = compose [ ../plugins/cli/dsh-tui ];
  repeatedDsh = compose [
    ../plugins/cli/dsh-tui
    ../plugins/harness/deepseek-harness
    ../plugins/cli/dsh-tui
  ];
  dshPackages = plugins: map (package: package.name) (homeFor plugins).home.packages;
  # opendesign の tool_calls index 衝突への回避策。dsh 本体側の plugin として
  # 独立し、対象プロファイルは dshOpendesignToolcallShim.profiles で選ぶ。
  dshOnly = compose [ ../plugins/harness/deepseek-harness ];
  shimActivation = plugins: (homeFor plugins).home.activation.installOpendesignToolcallShim.data;
  # `/publish` も dsh 本体側の plugin。対象プロファイルは dshPublish.profiles で選ぶ。
  publishActivation = plugins: (homeFor plugins).home.activation.installDshPublish.data;
  standalone = homeFor (compose [
    ../plugins/app/ghostty
    ../plugins/cli/helix
    ../plugins/cli/herdr
    ../plugins/cli/opencode
  ]);
  themed = homeFor (compose [ ../plugins/tool/terminal-theme ]);
  ghosttyOnly = homeFor (compose [ ../plugins/app/ghostty ]);
  herdrOnly = homeFor (compose [ ../plugins/cli/herdr ]);
  ghosttyProfile = import ../plugins/tool/terminal-theme/ghostty-config.nix;
  ghosttyBase = builtins.readFile ../plugins/app/ghostty/config;
  ghosttyCommand = "command = direct:/Users/koki/.nix-profile/bin/herdr --session ghostty\n";
  bootstrap = compose [ ../plugins/cli/ssh-bootstrap ];
  bootstrapPackages = bootstrap.packages pkgs;
in
lib.runTests {
  testEmptyComposition = {
    expr = [
      empty.overlays
      (empty.packages pkgs)
      (empty.apps { })
    ];
    expected = [
      [ ]
      { }
      { }
    ];
  };
  testDshDependency = {
    expr = builtins.any (name: lib.hasPrefix "deepseek-harness-" name) (dshPackages dsh);
    expected = true;
  };
  testShimIsOptIn = {
    # dsh 本体 plugin だけでは、どのプロファイルにも shim を入れない。
    expr = (homeFor dshOnly).home.activation ? installOpendesignToolcallShim;
    expected = false;
  };
  testShimTargetsSelectedProfiles = {
    # dsh-tui が選ぶのは dsh-tui プロファイルだけ。
    expr = lib.hasInfix "for profile in dsh-tui; do" (shimActivation dsh);
    expected = true;
  };
  testShimSkipsProfilesHomeManagerDoesNotOwn = {
    # desktop / web は手動管理なので、存在しなければスキップする。
    expr = lib.hasInfix "package.json" (shimActivation dsh) && lib.hasInfix "スキップ" (shimActivation dsh);
    expected = true;
  };
  testPublishIsOptIn = {
    # dsh 本体 plugin だけでは、どのプロファイルにも publish を入れない。
    expr = (homeFor dshOnly).home.activation ? installDshPublish;
    expected = false;
  };
  testPublishTargetsSelectedProfiles = {
    # dsh-tui が選ぶのは dsh-tui プロファイルだけ。
    expr =
      lib.hasInfix "for profile in dsh-tui; do" (publishActivation dsh)
      && lib.hasInfix "dsh-publish" (publishActivation dsh);
    expected = true;
  };
  testPublishSkipsProfilesHomeManagerDoesNotOwn = {
    # desktop / web は手動管理なので、存在しなければスキップする。
    expr =
      lib.hasInfix "package.json" (publishActivation dsh) && lib.hasInfix "スキップ" (publishActivation dsh);
    expected = true;
  };
  testDshLauncherAndProfile = {
    expr = builtins.elem "dst" (dshPackages dsh) && (homeFor dsh).home.activation ? installDshTui;
    expected = true;
  };
  testImportsAreDeduplicated = {
    expr = dshPackages repeatedDsh;
    expected = dshPackages dsh;
  };
  testSourceCanBeComposedDirectly = {
    expr = (homeFor (compose [ ../plugins/cli/helix/nixpkgs ])).programs.helix.enable;
    expected = true;
  };
  testStandaloneAppsHaveBaseConfigs = {
    expr = map toString [
      standalone.xdg.configFile."ghostty/config".source
      standalone.xdg.configFile."helix/config.toml".source
      standalone.xdg.configFile."herdr/config.toml".source
    ];
    expected = map toString [
      ../plugins/app/ghostty/config
      ../plugins/cli/helix/config.toml
      ../plugins/cli/herdr/config.toml
    ];
  };
  testThemeIsNotImplicit = {
    expr = standalone.home.activation ? terminalTheme;
    expected = false;
  };
  testGhosttyAloneHasNoHerdrOrTheme = {
    expr =
      ghosttyOnly.programs.ghostty.enable
      && !(lib.hasInfix "herdr" ghosttyBase)
      && !(ghosttyOnly.xdg.configFile ? "herdr/config.toml")
      && !(ghosttyOnly.home.activation ? terminalTheme)
      && !(builtins.any (package: lib.hasPrefix "herdr-" package.name) ghosttyOnly.home.packages);
    expected = true;
  };
  testHerdrAloneHasNoGhosttyOrTheme = {
    expr =
      herdrOnly.xdg.configFile ? "herdr/config.toml"
      && !herdrOnly.programs.ghostty.enable
      && !(herdrOnly.xdg.configFile ? "ghostty/config")
      && !(herdrOnly.home.activation ? terminalTheme);
    expected = true;
  };
  testGhosttyProfilesPreserveBaseSettings = {
    expr = map ghosttyProfile [
      { dark = false; }
      { dark = true; }
    ];
    expected = [
      (ghosttyCommand + ghosttyBase)
      (
        ghosttyCommand
        +
          builtins.replaceStrings
            [ "theme = iTerm2 Solarized Light" ]
            [
              "theme = ${
                builtins.path {
                  path = toString ../plugins/tool/terminal-theme/dark-modern.ghostty;
                  name = "dark-modern.ghostty";
                }
              }"
            ]
            ghosttyBase
      )
    ];
  };
  testGhosttyStandaloneRetainsBaseSettings = {
    expr = ghosttyBase;
    expected = ''
      font-family = JetBrainsMono Nerd Font Mono
      theme = iTerm2 Solarized Light
      background-opacity = 0.92
      background-opacity-cells = true
      macos-non-native-fullscreen = true
    '';
  };
  testGhosttyMacOSSourceFollowsXdg = {
    expr =
      map
        (
          home:
          home.home.file."Library/Application Support/com.mitchellh.ghostty/config".source
          == home.xdg.configFile."ghostty/config".source
        )
        [
          ghosttyOnly
          themed
        ];
    expected = [
      true
      true
    ];
  };
  testOpenCodeBaseConfig = {
    expr = lib.hasSuffix "-opencode-cli.json" (
      toString standalone.home.file.".config/opencode/cli.json".source
    );
    expected = true;
  };
  testOpenCodeInjectsGitSurgeon = {
    expr = builtins.any (package: lib.hasPrefix "git-surgeon-" package.name) standalone.home.packages;
    expected = true;
  };
  testThemeComposesItsApps = {
    expr =
      themed.programs.ghostty.enable
      && themed.programs.helix.enable
      && themed.programs.opencode.enable
      && themed.home.activation ? terminalTheme;
    expected = true;
  };
  testThemeOverridesBaseConfigs = {
    expr =
      themed.xdg.configFile."helix/config.toml".source
      != standalone.xdg.configFile."helix/config.toml".source
      &&
        themed.home.file.".config/opencode/cli.json".source
        != standalone.home.file.".config/opencode/cli.json".source;
    expected = true;
  };
  testBootstrapOwnsPackageAndApp = {
    expr = (bootstrap.apps bootstrapPackages).ssh-bootstrap.program;
    expected = "${bootstrapPackages.ssh-bootstrap}/bin/ssh-bootstrap";
  };
  testConflictingPackagesFail = {
    expr = succeeds (
      (compose [
        { packages = _: { collision = pkgs.hello; }; }
        { packages = _: { collision = pkgs.git; }; }
      ]).packages
        pkgs
    );
    expected = false;
  };
  testConflictingAppsFail = {
    expr = succeeds (
      (compose [
        { apps = _: { collision.program = "/one"; }; }
        { apps = _: { collision.program = "/two"; }; }
      ]).apps
        { }
    );
    expected = false;
  };
  testUnknownFieldsFail = {
    expr = succeeds (compose [ { hom = { }; } ]).home;
    expected = false;
  };
  testCategoryBundleComposesApps = {
    expr =
      (lib.evalModules {
        modules = [
          (compose [ ../plugins/app ]).darwin
          { options.homebrew = lib.mkOption { type = lib.types.attrsOf lib.types.anything; }; }
        ];
      }).config.homebrew.masApps.GarageBand;
    expected = 682658836;
  };
}
