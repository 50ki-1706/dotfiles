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
    ../plugins/cli/deepseek-harness
    ../plugins/cli/dsh-tui
  ];
  dshPackages = plugins: map (package: package.name) (homeFor plugins).home.packages;
  standalone = homeFor (compose [
    ../plugins/app/ghostty
    ../plugins/cli/helix
    ../plugins/cli/herdr
    ../plugins/cli/opencode
  ]);
  themed = homeFor (compose [ ../plugins/tool/terminal-theme ]);
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
