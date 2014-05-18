#!/bin/sh

set -e

installroot="$(dirname "$(readlink -f "$0")")"

cd "$installroot"
sh ./01-initial-scan.sh

exit 0
