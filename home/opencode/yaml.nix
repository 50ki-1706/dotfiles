let
  toYamlValue =
    value:
    if builtins.isString value then
      "\"${builtins.replaceStrings [ "\\" "\"" ] [ "\\\\" "\\\"" ] value}\""
    else if builtins.isBool value then
      if value then "true" else "false"
    else if builtins.isInt value then
      builtins.toString value
    else
      throw "Unsupported YAML value";

  toYamlKey =
    key: if builtins.match "[A-Za-z_][A-Za-z0-9_-]*" key != null then key else toYamlValue key;

  toYamlMap =
    indentation: attrs:
    if attrs == { } then
      "null"
    else
      builtins.concatStringsSep "\n" (
        map (
          key:
          let
            value = builtins.getAttr key attrs;
            yamlKey = toYamlKey key;
          in
          if builtins.isAttrs value then
            if value == { } then
              "${indentation}${yamlKey}: ${toYamlMap "${indentation}  " value}"
            else
              "${indentation}${yamlKey}:\n${toYamlMap "${indentation}  " value}"
          else
            "${indentation}${yamlKey}: ${toYamlValue value}"
        ) (builtins.sort (a: b: a < b) (builtins.attrNames attrs))
      );

  removeDenyOnly =
    attrs:
    builtins.listToAttrs (
      builtins.filter
        (
          entry:
          let
            value = entry.value;
          in
          if builtins.isAttrs value then
            !(builtins.all (v: v == "deny") (builtins.attrValues value))
          else if builtins.isBool value then
            value
          else if builtins.isString value then
            value != "deny"
          else
            true
        )
        (
          map (name: {
            inherit name;
            value = builtins.getAttr name attrs;
          }) (builtins.attrNames attrs)
        )
    );

  filterConfig =
    config:
    let
      filtered = builtins.removeAttrs config [ "prompt" ];
    in
    (
      if builtins.hasAttr "permission" filtered then
        filtered // { permission = removeDenyOnly filtered.permission; }
      else
        filtered
    )
    // (if builtins.hasAttr "tools" filtered then { tools = removeDenyOnly filtered.tools; } else { });
in
config:
let
  filtered = filterConfig config;
in
"---\n" + toYamlMap "" filtered + "\n---"
