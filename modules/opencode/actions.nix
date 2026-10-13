# OpenCode permission action space: single source of truth for action names.
#
# Captured from the pinned OpenCode v2.0.22 source tree
# (github.com/anomalyco/opencode commit 527f0b931d1f9b3ebd34e106c51b31ce5db5b075).
# `source` fields cite file:line under packages/ of that tree.
#
# MCP tool names are live-captured (initialize -> tools/list over stdio, never
# tools/call) against the servers configured in ./opencode.nix. Registered action
# name = `<sanitize(server)>_<sanitize(tool)>` with [^a-zA-Z0-9_-] -> "_"
# (packages/core/src/tool/mcp.ts:16-17, registered in runtime.ts:274-280).
# Re-capture with: nix run .#opencodeActionCheck -- --capture
# After a server upgrade, newly added tools stay denied until the captured names
# are reviewed, approved, and written here (fail-closed by design).
rec {
  # Servers whose tools participate in drift checks.
  mcpServers = [
    "graphify"
    "chrome-devtools"
  ];

  # Servers the checker may start for introspection. Keep in sync with opencode.nix.
  mcpIntrospectAllowlist = [
    "graphify"
    "chrome-devtools"
  ];

  # Tools under the `opencode` namespace that appear as rule actions.
  # session_rename / session_move / models do not call permission.assert
  # (tool/plugin/opencode.ts:90,110,135) but are rule-facing action names.
  opencodeActions = [
    "opencode_list_mcp_resources" # tool/plugin/mcp-resource.ts:18,37
    "opencode_read_mcp_resource" # tool/plugin/mcp-resource.ts:50,66
    "opencode_session_rename" # tool/plugin/opencode.ts:90
    "opencode_session_move" # tool/plugin/opencode.ts:110
    "opencode_models" # tool/plugin/opencode.ts:135
  ];

  # Full registered action names for MCP tools (live-captured, sorted).
  mcpToolActions = {
    graphify = [
      "graphify_get_community"
      "graphify_get_neighbors"
      "graphify_get_node"
      "graphify_get_pr_impact"
      "graphify_god_nodes"
      "graphify_graph_stats"
      "graphify_list_prs"
      "graphify_query_graph"
      "graphify_shortest_path"
      "graphify_triage_prs"
    ];
    chromeDevtools = [
      "chrome-devtools_click"
      "chrome-devtools_close_page"
      "chrome-devtools_drag"
      "chrome-devtools_emulate"
      "chrome-devtools_evaluate_script"
      "chrome-devtools_fill"
      "chrome-devtools_fill_form"
      "chrome-devtools_get_console_message"
      "chrome-devtools_get_network_request"
      "chrome-devtools_handle_dialog"
      "chrome-devtools_hover"
      "chrome-devtools_lighthouse_audit"
      "chrome-devtools_list_console_messages"
      "chrome-devtools_list_network_requests"
      "chrome-devtools_list_pages"
      "chrome-devtools_navigate_page"
      "chrome-devtools_new_page"
      "chrome-devtools_performance_analyze_insight"
      "chrome-devtools_performance_start_trace"
      "chrome-devtools_performance_stop_trace"
      "chrome-devtools_press_key"
      "chrome-devtools_resize_page"
      "chrome-devtools_select_page"
      "chrome-devtools_take_heapsnapshot"
      "chrome-devtools_take_screenshot"
      "chrome-devtools_take_snapshot"
      "chrome-devtools_type_text"
      "chrome-devtools_upload_file"
      "chrome-devtools_wait_for"
    ];
  };

  # Builtin tools and the permission action each asserts (or gates, for execute).
  builtinPairs = [
    {
      name = "read";
      action = "read";
      source = "packages/core/src/tool/plugin/read.ts:15 via file-access.ts:154";
    }
    {
      name = "edit";
      action = "edit";
      source = "packages/core/src/tool/plugin/edit.ts:22,181";
    }
    {
      name = "write";
      action = "edit";
      source = "packages/core/src/tool/plugin/write.ts:20,79";
    }
    {
      name = "patch";
      action = "edit";
      source = "packages/core/src/tool/plugin/patch.ts:19,197";
    }
    {
      name = "shell";
      action = "shell";
      source = "packages/core/src/tool/plugin/shell.ts:22,136";
    }
    {
      name = "glob";
      action = "glob";
      source = "packages/core/src/tool/plugin/glob.ts:15,69";
    }
    {
      name = "grep";
      action = "grep";
      source = "packages/core/src/tool/plugin/grep.ts:15,88";
    }
    {
      name = "webfetch";
      action = "webfetch";
      source = "packages/core/src/tool/plugin/webfetch.ts:12,125";
    }
    {
      name = "websearch";
      action = "websearch";
      source = "packages/core/src/tool/plugin/websearch.ts:12,50";
    }
    {
      name = "question";
      action = "question";
      source = "packages/core/src/tool/plugin/question.ts:10,65";
    }
    {
      name = "subagent";
      action = "subagent";
      source = "packages/core/src/tool/plugin/subagent.ts:17,140";
    }
    {
      name = "skill";
      action = "skill";
      source = "packages/core/src/tool/plugin/skill.ts:10,52";
    }
    {
      name = "list_mcp_resources";
      action = "opencode_list_mcp_resources";
      source = "packages/core/src/tool/plugin/mcp-resource.ts:18,37 (namespace opencode)";
    }
    {
      name = "read_mcp_resource";
      action = "opencode_read_mcp_resource";
      source = "packages/core/src/tool/plugin/mcp-resource.ts:50,66 (namespace opencode)";
    }
    {
      name = "session_rename";
      action = "opencode_session_rename";
      source = "packages/core/src/tool/plugin/opencode.ts:90 (namespace opencode)";
    }
    {
      name = "session_move";
      action = "opencode_session_move";
      source = "packages/core/src/tool/plugin/opencode.ts:110 (namespace opencode)";
    }
    {
      name = "models";
      action = "opencode_models";
      source = "packages/core/src/tool/plugin/opencode.ts:135 (namespace opencode)";
    }
    {
      name = "browser";
      action = "browser";
      source = "packages/plugin-browser/src/tools.ts:36,49";
    }
    {
      name = "external_directory";
      action = "external_directory";
      source = "packages/core/src/file-access.ts:135 (asserted by read/write paths, not a tool)";
    }
    {
      name = "execute";
      action = "execute";
      source = "packages/core/src/tool.ts:238 (codemode exposure gate, not a tool)";
    }
    {
      name = "mcp:<server>_<tool>";
      action = "<sanitize(server)>_<sanitize(tool)>";
      source = "packages/core/src/tool/mcp.ts:16-17,52 (dynamic per-server tools)";
    }
  ];

  # Actions asserted by the pinned core and runtime plugins; used as the
  # fail-closed monitor plugin baseline.
  coreActions = [
    "edit"
    "read"
    "external_directory"
    "glob"
    "grep"
    "shell"
    "webfetch"
    "websearch"
    "question"
    "skill"
    "subagent"
  ];

  # Every action string any config layer can contain, including runtime wildcards.
  # Drift checker: observed actions outside this set are additions (exit 1).
  ruleActions =
    coreActions
    ++ opencodeActions
    ++ mcpToolActions.graphify
    ++ mcpToolActions.chromeDevtools
    ++ [
      "execute"
      "browser"
      "graphify*"
      "chrome-devtools*"
      "opencode_*"
    ];

  # Actions the current repo config must emit; "opencode_*" is known but not
  # emitted (no opencodeTools = "deny" call site). Drift checker: missing
  # actions in this set are removals (exit 1).
  expectedRuleActions = builtins.filter (action: action != "opencode_*") ruleActions;

  # Serialized into the drift checker package by packages/opencode-action-check.nix.
  checkerBaseline = {
    inherit
      mcpServers
      mcpIntrospectAllowlist
      ruleActions
      expectedRuleActions
      mcpToolActions
      ;
  };
}
