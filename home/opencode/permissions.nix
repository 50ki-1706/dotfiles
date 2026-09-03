let
  denyAll = {
    "*" = "deny";
  };
  allowAll = {
    "*" = "allow";
  };
  bashAllow = {
    "*" = "allow";
    "sudo *" = "deny";
    "rm -rf *" = "deny";
    "chmod 777 *" = "deny";
    "chmod -R 777 *" = "deny";
    "chown -R *" = "deny";
    "dd *" = "deny";
    "shutdown *" = "deny";
    "reboot *" = "deny";
    "halt *" = "deny";
    "curl * | sh" = "deny";
    "curl * | bash" = "deny";
    "wget * | sh" = "deny";
    "wget * | bash" = "deny";
    "git reset --hard *" = "deny";
    "git clean *" = "deny";
    "git push*" = "ask";
    "brew install *" = "ask";
    "brew uninstall *" = "ask";
    "nix run home-manager -- switch --flake . *" = "ask";
  };
  readAllow = {
    "*" = "allow";
    ".env" = "deny";
    ".env.*" = "deny";
    "**/.env" = "deny";
    "**/.env.*" = "deny";
    ".env.example" = "allow";
    "**/.env.example" = "allow";
    "*.key" = "deny";
    "*.pem" = "deny";
    "id_rsa*" = "deny";
  };
  skillAllow = {
    "*" = "deny";
    "gh-cli" = "allow";
    "computer-use" = "allow";
    "orca-cli" = "allow";
    "orchestration" = "allow";
  };
  permissionValue =
    value: allowValue:
    if builtins.isAttrs value then
      value
    else if value == "allow" then
      allowValue
    else
      denyAll;
in
{
  bash ? "deny",
  read ? "deny",
  edit ? "deny",
  task ? "deny",
  grep ? "deny",
  glob ? "deny",
  list ? "deny",
  skill ? "deny",
  external_directory ? "deny",
}:
let
  taskPermission =
    if builtins.isList task then
      denyAll
      // builtins.listToAttrs (
        map (agent: {
          name = agent;
          value = "allow";
        }) task
      )
    else
      permissionValue task allowAll;
  externalDirectoryPermission =
    if builtins.isAttrs external_directory then
      external_directory
    else if external_directory == "allow" then
      "allow"
    else
      "deny";
in
{
  bash = permissionValue bash bashAllow;
  read = permissionValue read readAllow;
  edit = permissionValue edit allowAll;
  task = taskPermission;
  grep = permissionValue grep allowAll;
  glob = permissionValue glob allowAll;
  list = permissionValue list allowAll;
  skill = permissionValue skill skillAllow;
  external_directory = externalDirectoryPermission;
}
