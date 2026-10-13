let
  inherit (import ./guards.nix) shellGuards secretReadGuards;
  actions = import ./actions.nix;
in
{
  # Closed-world permission emitter.
  #
  # Permission rules are an ordered array: the LAST matching rule wins.
  # Capability options:
  #   "allow"   -> broad { <action>, "*", "allow" }; for shell/read the shared
  #                guards follow immediately, so scoped denials stay effective.
  #                For opencodeTools/graphify/chromeDevtools only the known
  #                exact action names from actions.nix are allowed (never a
  #                wildcard), so a new upstream tool stays denied until the
  #                baseline is reviewed and updated.
  #   "guarded" -> guards WITHOUT the broad allow (shell/read only): exposure
  #                and execution constraints without opening the capability.
  #   "deny"    -> { <action>, "*", "deny" } (wildcard for MCP capabilities).
  #   "inherit" -> emit nothing; resolves through the blanket deny (when
  #                denyAll = true) or the base/global layers otherwise.
  # subagent/skill also accept a non-empty list of allowed names; "allow" is
  # rejected. Package managers, servers, and drift checks share actions.nix as
  # the single source of truth for action names.
  denyAll ? false,
  # Required capabilities: omitting any of these fails evaluation.
  shell,
  read,
  glob,
  grep,
  edit,
  question,
  externalDirectory,
  webfetch,
  websearch,
  opencodeTools,
  # Optional capabilities default to deny (fail-closed).
  subagent ? "deny",
  skill ? "deny",
  execute ? "deny",
  graphify ? "deny",
  chromeDevtools ? "deny",
}:
let
  # The capability contract is closed: invalid values fail at evaluation time.
  checkedEnum =
    name: value:
    if
      builtins.isString value
      && builtins.elem value [
        "allow"
        "deny"
        "inherit"
        "guarded"
      ]
    then
      value
    else
      throw "permissions.nix: ${name} must be \"allow\", \"deny\", \"inherit\", or \"guarded\" (got ${builtins.toJSON value})";

  checkedPlainEnum =
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
    else if value == "guarded" then
      throw "permissions.nix: ${name} does not support \"guarded\" (only shell and read do)"
    else
      throw "permissions.nix: ${name} must be \"allow\", \"deny\", or \"inherit\" (got ${builtins.toJSON value})";

  checkedNames =
    name: value:
    if builtins.isList value && value != [ ] && builtins.all builtins.isString value then
      value
    else if builtins.isString value && (value == "deny" || value == "inherit") then
      value
    else if value == "allow" then
      throw "permissions.nix: ${name} does not accept \"allow\"; use a non-empty list of names, \"deny\", or \"inherit\""
    else
      throw "permissions.nix: ${name} must be \"deny\", \"inherit\", or a non-empty list of names (got ${builtins.toJSON value})";

  rule = action: resource: effect: { inherit action resource effect; };

  # OpenCode base defaults (schema/agent.ts Info.default) ask for these read
  # patterns. They are mirrored into every read-guard profile so that a broad
  # { read, "*", "allow" } cannot shadow them; secretReadGuards follow with
  # concrete denies, so overlaps such as `config.env.private.key` still resolve
  # to deny (last match wins).
  baseReadMirrors = [
    (rule "read" "*.env" "ask")
    (rule "read" "*.env.*" "ask")
    (rule "read" "*.env.example" "allow")
  ];

  allowIf = action: value: if value == "allow" then [ (rule action "*" "allow") ] else [ ];

  denyIf = action: value: if value == "deny" then [ (rule action "*" "deny") ] else [ ];

  guardsIf = guards: value: if value == "allow" || value == "guarded" then guards else [ ];

  exactAllowIf =
    value: names:
    if value == "allow" then builtins.map (action: rule action "*" "allow") names else [ ];

  # A name list always emits its wildcard deny first, also under denyAll, so
  # that unknown names stay denied regardless of the surrounding layers.
  namesRules =
    action: value:
    if builtins.isList value then
      [ (rule action "*" "deny") ] ++ builtins.map (name: rule action name "allow") value
    else
      [ ];

  sorted = builtins.sort (left: right: left < right);
  exact = {
    opencode = actions.opencodeActions;
    graphify = sorted actions.mcpToolActions.graphify;
    chromeDevtools = sorted actions.mcpToolActions.chromeDevtools;
  };

  opts = {
    shell = checkedEnum "shell" shell;
    read = checkedEnum "read" read;
    glob = checkedPlainEnum "glob" glob;
    grep = checkedPlainEnum "grep" grep;
    edit = checkedPlainEnum "edit" edit;
    question = checkedPlainEnum "question" question;
    externalDirectory = checkedPlainEnum "externalDirectory" externalDirectory;
    webfetch = checkedPlainEnum "webfetch" webfetch;
    websearch = checkedPlainEnum "websearch" websearch;
    opencodeTools = checkedPlainEnum "opencodeTools" opencodeTools;
    execute = checkedPlainEnum "execute" execute;
    graphify = checkedPlainEnum "graphify" graphify;
    chromeDevtools = checkedPlainEnum "chromeDevtools" chromeDevtools;
    subagent = checkedNames "subagent" subagent;
    skill = checkedNames "skill" skill;
  };

  # Emission order: blanket -> broad allows -> guards -> broad denies ->
  # subagent list -> skill list.
  emitted =
    (if denyAll then [ (rule "*" "*" "deny") ] else [ ])
    ++ allowIf "shell" opts.shell
    ++ allowIf "read" opts.read
    ++ allowIf "glob" opts.glob
    ++ allowIf "grep" opts.grep
    ++ allowIf "edit" opts.edit
    ++ allowIf "question" opts.question
    ++ allowIf "external_directory" opts.externalDirectory
    ++ allowIf "execute" opts.execute
    ++ allowIf "webfetch" opts.webfetch
    ++ allowIf "websearch" opts.websearch
    ++ exactAllowIf opts.opencodeTools exact.opencode
    ++ exactAllowIf opts.graphify exact.graphify
    ++ exactAllowIf opts.chromeDevtools exact.chromeDevtools
    ++ guardsIf shellGuards opts.shell
    ++ guardsIf baseReadMirrors opts.read
    ++ guardsIf secretReadGuards opts.read
    ++ denyIf "shell" opts.shell
    ++ denyIf "read" opts.read
    ++ denyIf "glob" opts.glob
    ++ denyIf "grep" opts.grep
    ++ denyIf "edit" opts.edit
    ++ denyIf "question" opts.question
    ++ denyIf "external_directory" opts.externalDirectory
    ++ denyIf "execute" opts.execute
    ++ denyIf "webfetch" opts.webfetch
    ++ denyIf "websearch" opts.websearch
    ++ denyIf "subagent" opts.subagent
    ++ denyIf "skill" opts.skill
    ++ denyIf "graphify*" opts.graphify
    ++ denyIf "chrome-devtools*" opts.chromeDevtools
    ++ denyIf "opencode_*" opts.opencodeTools
    ++ namesRules "subagent" opts.subagent
    ++ namesRules "skill" opts.skill;

  # Eval-time assertion: the actions this call site emits are a subset of the
  # baseline in actions.nix. Scope: action names of emitted rules only; name
  # lists (subagent/skill) become resources and are not part of the action
  # space.
  allowedActions = actions.ruleActions ++ [ "*" ];
  unknownActions = builtins.filter (r: !(builtins.elem r.action allowedActions)) emitted;
in
if unknownActions == [ ] then
  emitted
else
  throw "permissions.nix: unlisted action(s) ${
    builtins.toJSON (builtins.map (rule: rule.action) unknownActions)
  }. Update modules/opencode/actions.nix after reviewing the drift with `nix run .#opencodeActionCheck` and user approval."
