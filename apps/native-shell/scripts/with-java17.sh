#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" == darwin* ]]; then
  brew_java17_home="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  if [[ -d "$brew_java17_home" ]]; then
    export JAVA_HOME="$brew_java17_home"
    export PATH="$JAVA_HOME/bin:$PATH"
  elif [[ -x /usr/libexec/java_home ]] && java17_home="$(/usr/libexec/java_home -v 17 2>/dev/null)"; then
    export JAVA_HOME="$java17_home"
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi

exec "$@"
