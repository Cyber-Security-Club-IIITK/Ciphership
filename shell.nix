# Ciphership dev shell — use: nix-shell
# (replaces the README's venv flow on NixOS)
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [
    (pkgs.python3.withPackages (ps: [ ps.flask ps.numpy ]))
  ];
}
