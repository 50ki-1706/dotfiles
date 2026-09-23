profile:
let
  rule = effect: action: resource: { inherit action resource effect; };
  allow = rule "allow";
  deny = rule "deny";
  ask = rule "ask";

  readPermissions = [
    (deny "read" ".env")
    (deny "read" ".env.*")
    (deny "read" "**/.env")
    (deny "read" "**/.env.*")
    (allow "read" ".env.example")
    (allow "read" "**/.env.example")
    (deny "read" "*.key")
    (deny "read" "*.pem")
    (deny "read" "id_rsa*")
    (deny "read" "**/id_rsa*")
  ];
  skillPermissions = [
    (allow "skill" "gh-cli")
    (allow "skill" "computer-use")
    (allow "skill" "orca-cli")
    (allow "skill" "orchestration")
  ];

  # Preserve list order: the last matching permission rule wins.
  profiles = {
    global = [
      (deny "shell" "sudo *")
      (deny "shell" "rm -rf *")
      (deny "shell" "chmod 777 *")
      (deny "shell" "chmod -R 777 *")
      (deny "shell" "chown -R *")
      (deny "shell" "dd *")
      (deny "shell" "shutdown *")
      (deny "shell" "reboot *")
      (deny "shell" "halt *")
      (deny "shell" "curl * | sh")
      (deny "shell" "curl * | bash")
      (deny "shell" "wget * | sh")
      (deny "shell" "wget * | bash")
      (deny "shell" "git reset --hard *")
      (deny "shell" "git clean *")
      (ask "shell" "git push*")
      (ask "shell" "brew install *")
      (ask "shell" "brew uninstall *")
      (ask "shell" "nix run home-manager -- switch *")
    ]
    ++ readPermissions
    ++ [ (deny "skill" "*") ]
    ++ skillPermissions
    ++ [
      (deny "graphify*" "*")
      (deny "chrome-devtools*" "*")
      (deny "playwright*" "*")
    ];

    spec = [
      (deny "*" "*")
      (allow "subagent" "explore")
      (allow "subagent" "general")
      (allow "subagent" "plan_review")
      (allow "question" "*")
    ]
    ++ skillPermissions;

    general = [
      (deny "subagent" "*")
      (deny "question" "*")
      (deny "external_directory" "*")
      (allow "chrome-devtools*" "*")
      (allow "playwright*" "*")
    ];

    explore = [
      (deny "shell" "*")
      (deny "edit" "*")
      (deny "subagent" "*")
      (deny "question" "*")
      (deny "skill" "*")
      (allow "external_directory" "*")
      (allow "execute" "*")
      (allow "graphify*" "*")
    ];

    plan_review = [
      (deny "*" "*")
      (allow "read" "*")
    ]
    ++ readPermissions
    ++ [
      (allow "glob" "*")
      (allow "grep" "*")
      (allow "external_directory" "*")
      (allow "execute" "*")
      (allow "graphify*" "*")
    ];
  };
in
profiles.${profile}
