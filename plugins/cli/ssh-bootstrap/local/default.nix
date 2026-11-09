{
  packages = pkgs: { ssh-bootstrap = pkgs.callPackage ./package.nix { }; };
  apps = packages: {
    ssh-bootstrap = {
      type = "app";
      program = "${packages.ssh-bootstrap}/bin/ssh-bootstrap";
    };
  };
}
