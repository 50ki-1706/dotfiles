{
  lib,
  inputs,
  modules,
}:
(lib.evalModules {
  specialArgs = { inherit inputs; };
  modules = [ ./plugin-options.nix ] ++ modules;
}).config
