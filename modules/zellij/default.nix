{ lib, pkgs, ... }:
{
  home.packages = [ pkgs.zellij ];

  home.file.".config/zellij/layouts/ide.kdl".text = ''
    layout {
        default_tab_template {
            pane size=1 borderless=true {
                plugin location="tab-bar"
            }
            children
            pane size=1 borderless=true {
                plugin location="status-bar"
            }
        }

        tab name="ide" {
            pane split_direction="vertical" {
                pane split_direction="horizontal" size="70%" {
                    pane focus=true size="75%"
                    pane
                }
                pane split_direction="horizontal" {
                    pane
                    pane command="${lib.getExe pkgs.lazygit}"
                }
            }
        }
    }
  '';
  home.file.".config/zellij/layouts/split.kdl".text = ''
    layout {
        default_tab_template {
            pane size=1 borderless=true {
                plugin location="tab-bar"
            }
            children
            pane size=1 borderless=true {
                plugin location="status-bar"
            }
        }

        tab name="split" {
            pane split_direction="vertical" {
                pane focus=true
                pane
            }
        }
    }
  '';
  home.file.".config/zellij/config.kdl".source = ./config.kdl;
}
