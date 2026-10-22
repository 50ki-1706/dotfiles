# Pure Nix regression test for the approved Figma permission plan.
#
# Run: nix eval --json --file modules/opencode/tests/permissions.nix
#
# Imports the real agents.nix and actions.nix. The last-match evaluator below is
# a deliberately restricted model of the pinned runtime:
#   packages/core/src/permission.ts:87-97 uses findLast; denied() checks the same
#   evaluate() result before plugin hooks run.
#   packages/core/src/util/wildcard.ts:3-17 maps "*" to ".*", escapes other
#   regex characters, and anchors the match.
# It supports only the action patterns this repository emits for the checked
# actions: exact names, "*", and one trailing "*". wildcardMatch throws on any
# other pattern, so an unsupported future pattern cannot silently pass.
let
  agents = import ../agents.nix;
  actions = import ../actions.nix;
  mkPermissions = import ../permissions.nix;

  # Isolate figmaRules from unrelated capability rules. mcpResourceGuards are
  # always emitted; they are filtered out by action below.
  base = {
    shell = "inherit";
    read = "inherit";
    glob = "inherit";
    grep = "inherit";
    edit = "inherit";
    question = "inherit";
    externalDirectory = "inherit";
    webfetch = "inherit";
    websearch = "inherit";
    opencodeTools = "inherit";
  };
  mk = extra: mkPermissions (base // extra);

  expectedReads = [
    "figma_get_code_connect_map"
    "figma_get_design_context"
    "figma_get_figjam"
    "figma_get_metadata"
    "figma_get_screenshot"
    "figma_get_variable_defs"
    "figma_whoami"
  ];
  expectedWrites = [ "figma_add_code_connect_map" ];
  excludedActions = [
    "figma_delete_node"
    "figma_generate_figma_design"
    "figma_generate_image"
    "figma_html_to_figma"
    "figma_send_code_to_figma"
    "figma_unknown_tool"
    "figma_upload_assets"
    "figma_upload_file"
    "figma_use_figma"
    "figma_weave_run_model"
    "figma_weave_run_tool"
    "figma_weave_upload_asset"
    "figma_write_to_canvas"
  ];
  agentNames = [
    "spec"
    "general"
    "explore"
    "plan_review"
  ];

  sorted = builtins.sort (left: right: left < right);

  patternSupported =
    pattern:
    pattern == "*"
    || builtins.match "[A-Za-z0-9_-]+" pattern != null
    || builtins.match "[A-Za-z0-9_-]+[*]" pattern != null;

  wildcardMatch =
    action: pattern:
    if !(patternSupported pattern) then
      throw "tests/permissions.nix: unsupported wildcard pattern ${builtins.toJSON pattern}"
    else if pattern == "*" then
      true
    else if builtins.match "[A-Za-z0-9_-]+[*]" pattern != null then
      let
        prefix = builtins.substring 0 (builtins.stringLength pattern - 1) pattern;
      in
      builtins.substring 0 (builtins.stringLength prefix) action == prefix
    else
      action == pattern;

  ruleMatches = action: rule: wildcardMatch action rule.action && wildcardMatch "*" rule.resource;

  findLast =
    predicate: list:
    let
      reversed = builtins.foldl' (accumulator: item: [ item ] ++ accumulator) [ ] list;
      matches = builtins.filter predicate reversed;
    in
    if matches == [ ] then null else builtins.head matches;

  effective =
    action: rules:
    let
      found = findLast (ruleMatches action) rules;
    in
    if found == null then "ask" else found.effect;

  indexOfFirst =
    predicate: list:
    let
      indices = builtins.genList (index: index) (builtins.length list);
      matches = builtins.filter (index: predicate (builtins.elemAt list index)) indices;
    in
    if matches == [ ] then null else builtins.head matches;

  indexOfAction = action: indexOfFirst (rule: rule.action == action);

  firstAllowIndex =
    names: indexOfFirst (rule: rule.effect == "allow" && builtins.elem rule.action names);

  before = left: right: left != null && right != null && left < right;

  scopeRules =
    name:
    if name == "global" then
      agents.permissions
    else
      agents.permissions ++ agents.agents.${name}.permissions;

  scopes = builtins.map (name: {
    inherit name;
    rules = scopeRules name;
  }) ([ "global" ] ++ agentNames);

  figmaToolActions = [ "figma*" ] ++ expectedReads ++ expectedWrites;
  figmaToolRules = rules: builtins.filter (rule: builtins.elem rule.action figmaToolActions) rules;
  ruleKeys = rules: builtins.map (rule: "${rule.action}|${rule.resource}|${rule.effect}") rules;

  wildcardDeny = {
    action = "figma*";
    resource = "*";
    effect = "deny";
  };
  allowRules =
    names:
    builtins.map (action: {
      inherit action;
      resource = "*";
      effect = "allow";
    }) names;
  expectedReadRules = [ wildcardDeny ] ++ allowRules expectedReads;
  expectedWriteRules = expectedReadRules ++ allowRules expectedWrites;
  expectedDenyRules = [ wildcardDeny ];

  defaultRules = mk { };
  inheritRules = mk { figma = "inherit"; };
  denyRules = mk { figma = "deny"; };
  readRules = mk { figma = "read"; };
  writeRules = mk { figma = "write"; };

  throws = expression: !(builtins.tryEval (builtins.deepSeq expression true)).success;

  check = message: condition: if condition then null else message;
  checks = [
    (check "figmaReadActions must be exactly the seven documented read names" (
      sorted actions.figmaReadActions == expectedReads
    ))
    (check "figmaWriteActions must be exactly the one approved mapping action" (
      sorted actions.figmaWriteActions == expectedWrites
    ))
    (check "mcpToolActions.figma must be the exact read+write union" (
      sorted actions.mcpToolActions.figma == sorted (expectedReads ++ expectedWrites)
    ))
    (check "ruleActions must contain every Figma action and figma*" (
      builtins.all (action: builtins.elem action actions.ruleActions) (
        expectedReads ++ expectedWrites ++ [ "figma*" ]
      )
    ))

    (check "the default figma capability must behave as deny" (
      ruleKeys (figmaToolRules defaultRules) == ruleKeys expectedDenyRules
    ))
    (check "figma=inherit must emit no Figma tool rules" (figmaToolRules inheritRules == [ ]))
    (check "figma=deny must emit only the wildcard deny" (
      ruleKeys (figmaToolRules denyRules) == ruleKeys expectedDenyRules
    ))
    (check "figma=read must emit wildcard deny then exactly seven read allows" (
      ruleKeys (figmaToolRules readRules) == ruleKeys expectedReadRules
    ))
    (check "figma=write must emit wildcard deny, seven reads, then the one write" (
      ruleKeys (figmaToolRules writeRules) == ruleKeys expectedWriteRules
    ))

    (check "figma=allow must be rejected" (
      throws (mk {
        figma = "allow";
      })
    ))
    (check "figma=guarded must be rejected" (
      throws (mk {
        figma = "guarded";
      })
    ))
    (check "figma=[] must be rejected" (
      throws (mk {
        figma = [ ];
      })
    ))
    (check "figma=[\"read\"] must be rejected" (
      throws (mk {
        figma = [ "read" ];
      })
    ))
    (check "figma=1 must be rejected" (
      throws (mk {
        figma = 1;
      })
    ))
    (check "figma=true must be rejected" (
      throws (mk {
        figma = true;
      })
    ))
    (check "figma=null must be rejected" (
      throws (mk {
        figma = null;
      })
    ))
    (check "unsupported wildcard patterns must not silently pass" (
      throws (wildcardMatch "figma_x" "figma[0-9]*")
    ))
  ]
  ++ builtins.concatMap (
    scope:
    [
      (check "all seven Figma reads must allow for ${scope.name}" (
        builtins.all (action: effective action scope.rules == "allow") expectedReads
      ))
      (check "the Code Connect mapping action must be limited to general (${scope.name})" (
        if scope.name == "general" then
          effective "figma_add_code_connect_map" scope.rules == "allow"
        else
          effective "figma_add_code_connect_map" scope.rules == "deny"
      ))
      (check "unknown and excluded Figma actions must be denied for ${scope.name}" (
        builtins.all (action: effective action scope.rules == "deny") excludedActions
      ))
      (check "figma* deny must precede every exact Figma grant for ${scope.name}" (
        before (indexOfAction "figma*" scope.rules) (firstAllowIndex expectedReads scope.rules)
      ))
      (check "no wildcard allow may exist for ${scope.name}" (
        builtins.all (
          rule:
          !(
            rule.effect == "allow"
            && builtins.elem rule.action [
              "*"
              "figma*"
            ]
          )
        ) scope.rules
      ))
      (check "all emitted rule actions must be baselined for ${scope.name}" (
        builtins.all (rule: builtins.elem rule.action (actions.ruleActions ++ [ "*" ])) scope.rules
      ))
    ]
    ++ (
      if scope.name == "general" then
        [
          (check "the one write grant must follow the figma* deny for general" (
            before (indexOfAction "figma*" scope.rules) (firstAllowIndex expectedWrites scope.rules)
          ))
        ]
      else
        [
          (check "no write grant may exist outside general (${scope.name})" (
            firstAllowIndex expectedWrites scope.rules == null
          ))
        ]
    )
  ) scopes
  ++ [
    (check "spec execute must remain denied" (effective "execute" (scopeRules "spec") == "deny"))
  ];

  failures = builtins.filter (failure: failure != null) checks;
in
if failures != [ ] then
  throw "tests/permissions.nix: ${builtins.concatStringsSep "; " failures}"
else
  {
    status = "ok";
    readActions = actions.figmaReadActions;
    writeActions = actions.figmaWriteActions;
    agents = agentNames;
  }
