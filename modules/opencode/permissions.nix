let
  inherit (import ./guards.nix) shellGuards secretReadGuards;
in
{
  denyAll ? false,
  shell ? "inherit",
  read ? "inherit",
  glob ? "inherit",
  grep ? "inherit",
  edit ? "inherit",
  question ? "inherit",
  externalDirectory ? "inherit",
  execute ? "inherit",
  graphify ? "inherit",
  chromeDevtools ? "inherit",
  subagent ? "inherit",
  skill ? "inherit",
}:
let
  # Permission rules are an ordered array: the LAST matching rule wins.
  # Capability options:
  #   "allow"   -> { <action>, "*", "allow" }; for shell/read the shared guard
  #                blocks follow immediately, so scoped denials stay effective.
  #   "deny"    -> { <action>, "*", "deny" }.
  #   "inherit" -> emit nothing; with denyAll=true it resolves to the blanket
  #                deny, otherwise it follows the global rules / base defaults.
  # subagent/skill also accept a list of allowed names; "allow" is rejected.
  # shellGuards/secretReadGuards are emitted in EVERY profile, so each agent
  # array is self-contained; resolution is identical because the same rules
  # exist in the global array.

  # The capability contract is closed: invalid values fail at evaluation time.
  checkedEnum =
    name: value:
    if
      builtins.isString value
      && builtins.elem value [
        "allow"
        "deny"
        "inherit"
      ]
    then
      value
    else
      throw "permissions.nix: ${name} must be \"allow\", \"deny\", or \"inherit\" (got ${builtins.toJSON value})";

  checkedNames =
    name: value:
    if builtins.isList value && builtins.all builtins.isString value then
      value
    else if builtins.isString value && (value == "deny" || value == "inherit") then
      value
    else
      throw "permissions.nix: ${name} must be \"deny\", \"inherit\", or a list of names (got ${builtins.toJSON value})";

  rule = action: resource: effect: { inherit action resource effect; };

  allRules = action: effect: [ (rule action "*" effect) ];

  broadAllow = action: value: if value == "allow" then allRules action "allow" else [ ];

  broadDeny = action: value: if value == "deny" then allRules action "deny" else [ ];

  namesRules =
    action: emitDeny: value:
    if builtins.isList value then
      (if emitDeny then allRules action "deny" else [ ])
      ++ builtins.map (name: rule action name "allow") value
    else
      [ ];

  opts = {
    shell = checkedEnum "shell" shell;
    read = checkedEnum "read" read;
    glob = checkedEnum "glob" glob;
    grep = checkedEnum "grep" grep;
    edit = checkedEnum "edit" edit;
    question = checkedEnum "question" question;
    externalDirectory = checkedEnum "externalDirectory" externalDirectory;
    execute = checkedEnum "execute" execute;
    graphify = checkedEnum "graphify" graphify;
    chromeDevtools = checkedEnum "chromeDevtools" chromeDevtools;
    subagent = checkedNames "subagent" subagent;
    skill = checkedNames "skill" skill;
  };
in
(if denyAll then [ (rule "*" "*" "deny") ] else [ ])
++ broadAllow "shell" opts.shell
++ broadAllow "read" opts.read
++ broadAllow "glob" opts.glob
++ broadAllow "grep" opts.grep
++ broadAllow "edit" opts.edit
++ broadAllow "question" opts.question
++ broadAllow "external_directory" opts.externalDirectory
++ broadAllow "execute" opts.execute
++ broadAllow "graphify*" opts.graphify
++ broadAllow "chrome-devtools*" opts.chromeDevtools
++ shellGuards
++ secretReadGuards
++ broadDeny "shell" opts.shell
++ broadDeny "read" opts.read
++ broadDeny "glob" opts.glob
++ broadDeny "grep" opts.grep
++ broadDeny "edit" opts.edit
++ broadDeny "question" opts.question
++ broadDeny "external_directory" opts.externalDirectory
++ broadDeny "execute" opts.execute
++ broadDeny "subagent" opts.subagent
++ broadDeny "skill" opts.skill
++ broadDeny "graphify*" opts.graphify
++ broadDeny "chrome-devtools*" opts.chromeDevtools
++ namesRules "subagent" true opts.subagent
++ namesRules "skill" (!denyAll) opts.skill
